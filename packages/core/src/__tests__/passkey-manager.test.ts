import { describe, it, expect } from "vitest";
import { PasskeyManager } from "../keys/passkey.js";
import { Keypair } from "@stellar/stellar-sdk";

describe("PasskeyManager", () => {
  describe("deriveKeypairFallback", () => {
    it("same inputs always produce the same keypair (determinism)", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id-123");
      const username = "testuser";

      const keypair1 = await manager.deriveKeypairFallback(credentialId, username);
      const keypair2 = await manager.deriveKeypairFallback(credentialId, username);

      expect(keypair1.publicKey()).toBe(keypair2.publicKey());
      expect(keypair1.secret()).toBe(keypair2.secret());
    });

    it("different usernames produce different keypairs", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id-123");

      const keypair1 = await manager.deriveKeypairFallback(credentialId, "user1");
      const keypair2 = await manager.deriveKeypairFallback(credentialId, "user2");

      expect(keypair1.publicKey()).not.toBe(keypair2.publicKey());
      expect(keypair1.secret()).not.toBe(keypair2.secret());
    });

    it("different credential IDs produce different keypairs", async () => {
      const manager = new PasskeyManager();
      const username = "testuser";

      const keypair1 = await manager.deriveKeypairFallback(
        new TextEncoder().encode("cred-1"),
        username,
      );
      const keypair2 = await manager.deriveKeypairFallback(
        new TextEncoder().encode("cred-2"),
        username,
      );

      expect(keypair1.publicKey()).not.toBe(keypair2.publicKey());
      expect(keypair1.secret()).not.toBe(keypair2.secret());
    });

    it("returns a valid Stellar keypair", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id-123");
      const username = "testuser";

      const keypair = await manager.deriveKeypairFallback(credentialId, username);

      expect(keypair).toBeInstanceOf(Keypair);
      expect(typeof keypair.publicKey()).toBe("string");
      expect(keypair.publicKey()).toMatch(/^G[A-Z0-9]{55}$/);
      expect(typeof keypair.secret()).toBe("string");
      expect(keypair.secret()).toMatch(/^S[A-Z0-9]{55}$/);
    });
  });

  describe("deriveKeypairFromWebAuthn", () => {
    it("uses PRF path when PRF output is available", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id");
      const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
      const username = "testuser";

      const keypair = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        prfOutput,
        username,
      });

      expect(keypair).toBeInstanceOf(Keypair);
      expect(keypair.publicKey()).toMatch(/^G[A-Z0-9]{55}$/);
    });

    it("uses fallback path when PRF output is unavailable", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id");
      const username = "testuser";

      const keypair = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        username,
      });

      expect(keypair).toBeInstanceOf(Keypair);
      expect(keypair.publicKey()).toMatch(/^G[A-Z0-9]{55}$/);
    });

    it("PRF path produces deterministic results", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id");
      const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
      const username = "testuser";

      const keypair1 = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        prfOutput,
        username,
      });

      const keypair2 = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        prfOutput,
        username,
      });

      expect(keypair1.publicKey()).toBe(keypair2.publicKey());
    });

    it("fallback path produces deterministic results", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id");
      const username = "testuser";

      const keypair1 = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        username,
      });

      const keypair2 = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        username,
      });

      expect(keypair1.publicKey()).toBe(keypair2.publicKey());
    });

    it("PRF path and fallback path produce different keypairs", async () => {
      const manager = new PasskeyManager();
      const credentialId = new TextEncoder().encode("test-credential-id");
      const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
      const username = "testuser";

      const keypairPRF = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        prfOutput,
        username,
      });

      const keypairFallback = await manager.deriveKeypairFromWebAuthn({
        credentialId,
        username,
      });

      expect(keypairPRF.publicKey()).not.toBe(keypairFallback.publicKey());
    });
  });
});
