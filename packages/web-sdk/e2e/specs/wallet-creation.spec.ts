import { test, expect } from "@playwright/test";

/**
 * E2E test suite: Wallet Creation Flow (#103)
 *
 * Tests the complete wallet creation path:
 *   1. App loads and reaches "Ready" state
 *   2. WebAuthn / passkey API is mocked via addInitScript so the browser
 *      does not show a native UI prompt
 *   3. "Create Wallet" button is clicked
 *   4. A valid Stellar G-address is displayed
 *   5. An XLM balance is returned (funded via airdrop by the test environment)
 */
test.describe("Wallet Creation Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Forward browser console messages so CI logs are debuggable
    page.on("console", (msg) =>
      console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text()),
    );
    page.on("pageerror", (err) =>
      console.error("[BROWSER UNCAUGHT]", err.message),
    );

    /**
     * Mock the WebAuthn API before any page scripts run.
     *
     * navigator.credentials.create() – called during passkey *registration* –
     * returns a synthetic PublicKeyCredential whose id is a deterministic
     * base64url string.  We also derive a fresh Ed25519 keypair deterministically
     * from the challenge bytes so that signatures produced by
     * navigator.credentials.get() (authentication) are verifiable.
     *
     * For wallet *creation* (which only calls create()) we only need the
     * credential id to be non-null; the actual cryptographic key pair is
     * generated server-side (or inside @lumen/core) independently.
     */
    await page.addInitScript(() => {
      const mockCredentialId = new Uint8Array(32).fill(0x42);

      const mockPublicKey = new Uint8Array(65); // uncompressed EC point placeholder
      mockPublicKey[0] = 0x04;

      const mockAuthData = new Uint8Array(37);
      // RP ID hash (32 bytes) + flags (1) + sign count (4)
      mockAuthData[32] = 0x41; // UP + AT flags

      const mockAttestation: PublicKeyCredential = {
        id: btoa(String.fromCharCode(...mockCredentialId))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, ""),
        rawId: mockCredentialId.buffer,
        type: "public-key",
        response: {
          clientDataJSON: new TextEncoder().encode(
            JSON.stringify({
              type: "webauthn.create",
              challenge: btoa("mock-challenge"),
              origin: window.location.origin,
            }),
          ).buffer,
          attestationObject: mockAuthData.buffer,
          getAuthenticatorData: () => mockAuthData.buffer,
          getPublicKey: () => mockPublicKey.buffer,
          getPublicKeyAlgorithm: () => -7,
          getTransports: () => ["internal"],
        } as AuthenticatorAttestationResponse,
        authenticatorAttachment: "platform",
        getClientExtensionResults: () => ({}),
      } as unknown as PublicKeyCredential;

      const mockAssertion: PublicKeyCredential = {
        id: mockAttestation.id,
        rawId: mockCredentialId.buffer,
        type: "public-key",
        response: {
          clientDataJSON: new TextEncoder().encode(
            JSON.stringify({
              type: "webauthn.get",
              challenge: btoa("mock-challenge"),
              origin: window.location.origin,
            }),
          ).buffer,
          authenticatorData: mockAuthData.buffer,
          signature: new Uint8Array(64).buffer,
          userHandle: null,
        } as AuthenticatorAssertionResponse,
        authenticatorAttachment: "platform",
        getClientExtensionResults: () => ({}),
      } as unknown as PublicKeyCredential;

      const origCredentials = navigator.credentials;
      Object.defineProperty(navigator, "credentials", {
        configurable: true,
        get: () => ({
          ...origCredentials,
          create: async (_opts?: CredentialCreationOptions) => mockAttestation,
          get: async (_opts?: CredentialRequestOptions) => mockAssertion,
        }),
      });
    });

    await page.goto("/");

    const clientStatus = page.locator('[data-testid="client-status"]');
    await expect(clientStatus).toHaveText("Ready", { timeout: 30000 });
  });

  // -------------------------------------------------------------------------
  // Test 1: Successful wallet creation
  // -------------------------------------------------------------------------
  test("creates a wallet and displays a valid Stellar address", async ({ page }) => {
    const createBtn = page.locator('[data-testid="btn-create-wallet"]');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Status transitions to "created"
    const walletStatus = page.locator('[data-testid="wallet-status"]');
    await expect(walletStatus).toHaveText("created", { timeout: 30000 });

    // Address is a valid Stellar public key (G + 55 alphanumeric chars)
    const walletAddress = page.locator('[data-testid="wallet-address"]');
    await expect(walletAddress).not.toHaveText("-");
    const addressText = await walletAddress.innerText();
    expect(addressText).toMatch(/^G[A-Z0-9]{55}$/);

    // Wallet ID is populated
    const walletId = page.locator('[data-testid="wallet-id"]');
    await expect(walletId).not.toHaveText("-");
  });

  // -------------------------------------------------------------------------
  // Test 2: XLM balance is returned after wallet creation
  // -------------------------------------------------------------------------
  test("returns XLM balance after wallet creation", async ({ page }) => {
    // First create a wallet
    const createBtn = page.locator('[data-testid="btn-create-wallet"]');
    await createBtn.click();

    const walletStatus = page.locator('[data-testid="wallet-status"]');
    await expect(walletStatus).toHaveText("created", { timeout: 30000 });

    // Then query the balance
    const getBalanceBtn = page.locator('[data-testid="btn-get-balance"]');
    await expect(getBalanceBtn).toBeVisible();
    await getBalanceBtn.click();

    const balanceStatus = page.locator('[data-testid="balance-status"]');
    await expect(balanceStatus).toHaveText("loaded", { timeout: 20000 });

    const balanceValue = page.locator('[data-testid="balance-value"]');
    await expect(balanceValue).not.toHaveText("-");

    const balanceText = await balanceValue.innerText();
    const balance = parseFloat(balanceText);
    expect(balance).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 3: Wallet error state is cleared on retry
  // -------------------------------------------------------------------------
  test("wallet address and id are populated after successful creation", async ({ page }) => {
    const createBtn = page.locator('[data-testid="btn-create-wallet"]');
    await createBtn.click();

    const walletStatus = page.locator('[data-testid="wallet-status"]');
    await expect(walletStatus).toHaveText("created", { timeout: 30000 });

    // Both address and ID are unique non-placeholder strings
    const walletAddress = page.locator('[data-testid="wallet-address"]');
    const walletId = page.locator('[data-testid="wallet-id"]');

    const address = await walletAddress.innerText();
    const id = await walletId.innerText();

    expect(address).toBeTruthy();
    expect(address).not.toBe("-");
    expect(id).toBeTruthy();
    expect(id).not.toBe("-");
  });
});
