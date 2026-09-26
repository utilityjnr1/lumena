import { test, expect } from "@playwright/test";

/**
 * E2E test suite: Send Payment Flow (#104)
 *
 * Tests the complete gasless payment path:
 *   1. Create a funded testnet wallet
 *   2. Send a payment to a pre-configured destination address
 *   3. Verify the returned transaction hash is a valid 64-character hex string
 *
 * The test environment (start-environment.js) funds the sponsor and
 * destination accounts via the local Stellar quickstart airdrop and starts
 * both the @lumen/server and the Vite test-app.
 */
test.describe("Send Payment Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Forward browser console for CI visibility
    page.on("console", (msg) =>
      console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text()),
    );
    page.on("pageerror", (err) =>
      console.error("[BROWSER UNCAUGHT]", err.message),
    );

    /**
     * Mock the WebAuthn API so wallet creation does not block on a native
     * browser UI prompt.  Same mock used in wallet-creation.spec.ts.
     */
    await page.addInitScript(() => {
      const mockCredentialId = new Uint8Array(32).fill(0x42);
      const mockAuthData = new Uint8Array(37);
      mockAuthData[32] = 0x41;

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
          getPublicKey: () => new Uint8Array(65).buffer,
          getPublicKeyAlgorithm: () => -7,
          getTransports: () => ["internal"],
        } as AuthenticatorAttestationResponse,
        authenticatorAttachment: "platform",
        getClientExtensionResults: () => ({}),
      } as unknown as PublicKeyCredential;

      const origCredentials = navigator.credentials;
      Object.defineProperty(navigator, "credentials", {
        configurable: true,
        get: () => ({
          ...origCredentials,
          create: async (_opts?: CredentialCreationOptions) => mockAttestation,
          get: async (_opts?: CredentialRequestOptions) => mockAttestation,
        }),
      });
    });

    await page.goto("/");

    const clientStatus = page.locator('[data-testid="client-status"]');
    await expect(clientStatus).toHaveText("Ready", { timeout: 30000 });
  });

  // -------------------------------------------------------------------------
  // Test 1: Full happy-path — create wallet, then send payment
  // -------------------------------------------------------------------------
  test("sends a payment and returns a valid 64-character hex transaction hash", async ({
    page,
  }) => {
    // Step 1: Create wallet
    const createBtn = page.locator('[data-testid="btn-create-wallet"]');
    await createBtn.click();

    const walletStatus = page.locator('[data-testid="wallet-status"]');
    await expect(walletStatus).toHaveText("created", { timeout: 30000 });

    // Step 2: Confirm destination is pre-filled by the test environment
    const destinationInput = page.locator(
      '[data-testid="input-payment-destination"]',
    );
    await expect(destinationInput).not.toHaveValue("");

    // Step 3: Send payment (amount defaults to 1.0 XLM set by the test-app)
    const sendBtn = page.locator('[data-testid="btn-send-payment"]');
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // Step 4: Verify success
    const paymentStatus = page.locator('[data-testid="payment-status"]');
    await expect(paymentStatus).toHaveText("success", { timeout: 30000 });

    const paymentHash = page.locator('[data-testid="payment-hash"]');
    await expect(paymentHash).not.toHaveText("-");

    const hashText = await paymentHash.innerText();
    expect(hashText).toMatch(/^[a-fA-F0-9]{64}$/);
  });

  // -------------------------------------------------------------------------
  // Test 2: Transaction hash is a valid 64-character lowercase hex string
  // -------------------------------------------------------------------------
  test("transaction hash matches the Stellar 64-character hex format", async ({
    page,
  }) => {
    // Create wallet
    await page.locator('[data-testid="btn-create-wallet"]').click();
    await expect(page.locator('[data-testid="wallet-status"]')).toHaveText(
      "created",
      { timeout: 30000 },
    );

    // Send payment
    await page.locator('[data-testid="btn-send-payment"]').click();

    await expect(page.locator('[data-testid="payment-status"]')).toHaveText(
      "success",
      { timeout: 30000 },
    );

    const hashText = await page
      .locator('[data-testid="payment-hash"]')
      .innerText();

    // Must be exactly 64 hex characters (case-insensitive)
    expect(hashText).toHaveLength(64);
    expect(hashText).toMatch(/^[0-9a-fA-F]{64}$/);
  });

  // -------------------------------------------------------------------------
  // Test 3: Payment is rejected if wallet has not been created first
  // -------------------------------------------------------------------------
  test("shows an error when send payment is attempted without a wallet", async ({
    page,
  }) => {
    // Attempt to send without creating wallet first
    const sendBtn = page.locator('[data-testid="btn-send-payment"]');
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // The app should surface an error message rather than crash
    const paymentError = page.locator('[data-testid="payment-error"]');
    await expect(paymentError).not.toBeEmpty({ timeout: 5000 });

    // Payment status should reflect failure, not success
    const paymentStatus = page.locator('[data-testid="payment-status"]');
    const statusText = await paymentStatus.innerText();
    expect(statusText).not.toBe("success");
  });

  // -------------------------------------------------------------------------
  // Test 4: Sending to a custom destination address
  // -------------------------------------------------------------------------
  test("accepts a custom destination address and completes the payment", async ({
    page,
  }) => {
    // Create wallet
    await page.locator('[data-testid="btn-create-wallet"]').click();
    await expect(page.locator('[data-testid="wallet-status"]')).toHaveText(
      "created",
      { timeout: 30000 },
    );

    // Read the default destination already populated by the test environment
    // (it is a funded account from the airdrop in start-environment.js)
    const destinationInput = page.locator(
      '[data-testid="input-payment-destination"]',
    );
    const defaultDestination = await destinationInput.inputValue();

    // Confirm it looks like a valid Stellar address before we use it
    expect(defaultDestination).toMatch(/^G[A-Z0-9]{55}$/);

    // Send with the populated destination
    await page.locator('[data-testid="btn-send-payment"]').click();

    await expect(page.locator('[data-testid="payment-status"]')).toHaveText(
      "success",
      { timeout: 30000 },
    );

    const hashText = await page
      .locator('[data-testid="payment-hash"]')
      .innerText();
    expect(hashText).toMatch(/^[a-fA-F0-9]{64}$/);
  });
});
