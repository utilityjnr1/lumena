import { Keypair } from "@stellar/stellar-sdk";

export interface PasskeyCredential {
  id: string;
  rawId: ArrayBuffer;
  type: "public-key";
  response: {
    clientDataJSON: ArrayBuffer;
    attestationObject?: ArrayBuffer;
    authenticatorData?: ArrayBuffer;
    signature?: ArrayBuffer;
    userHandle?: ArrayBuffer | null;
  };
  prfResults?: {
    first?: ArrayBuffer;
    second?: ArrayBuffer;
  };
}

export interface PasskeyRegistrationOpts {
  username: string;
  rpName?: string;
  challenge?: Uint8Array;
}

export interface PasskeyAssertionOpts {
  credentialId?: string | Uint8Array;
  challenge?: Uint8Array;
}

export class PasskeyManager {
  static isWebAuthnSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.navigator !== "undefined" &&
      !!window.navigator.credentials &&
      typeof window.navigator.credentials.create === "function"
    );
  }

  static isPrfSupported(): boolean {
    return (
      PasskeyManager.isWebAuthnSupported() &&
      typeof PublicKeyCredential !== "undefined" &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
    );
  }

  /**
   * Registers a new WebAuthn credential (passkey) with PRF extension support or deterministic fallback.
   */
  async registerPasskey(opts: PasskeyRegistrationOpts): Promise<{
    credentialId: string;
    keypair: Keypair;
    credential: PasskeyCredential;
  }> {
    const rpName = opts.rpName ?? "Lumen Wallet";
    const challenge = opts.challenge ?? crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    let credentialId: string;
    let keypair: Keypair;
    let credentialObj: PasskeyCredential;

    if (PasskeyManager.isWebAuthnSupported()) {
      const prfSalt = new TextEncoder().encode(`lumen-passkey-prf-salt:${opts.username}`);
      const prfSaltPadded = new Uint8Array(32);
      prfSaltPadded.set(prfSalt.subarray(0, 32));

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: challenge as BufferSource,
        rp: { name: rpName },
        user: {
          id: userId as BufferSource,
          name: opts.username,
          displayName: opts.username,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" }, // ES256 (Secp256r1)
          { alg: -257, type: "public-key" }, // RS256
        ],
        authenticatorSelection: {
          userVerification: "preferred",
          residentKey: "preferred",
        },
        extensions: {
          prf: {
            eval: {
              first: prfSaltPadded as BufferSource,
            },
          },
        } as any,
      };

      const credential = (await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error("Passkey registration canceled or failed.");
      }

      const clientDataJSON = credential.response.clientDataJSON;
      const rawId = credential.rawId;
      credentialId = Buffer.from(new Uint8Array(rawId)).toString("base64url");

      const extensionResults = credential.getClientExtensionResults
        ? credential.getClientExtensionResults()
        : {};
      const prfOutput = (extensionResults as any)?.prf?.results?.first;

      keypair = await this.deriveKeypairFromWebAuthn({
        credentialId: rawId,
        clientDataJSON,
        prfOutput,
        username: opts.username,
      });

      credentialObj = {
        id: credential.id,
        rawId,
        type: "public-key",
        response: {
          clientDataJSON,
          attestationObject: (credential.response as AuthenticatorAttestationResponse).attestationObject,
        },
        prfResults: prfOutput ? { first: prfOutput } : undefined,
      };
    } else {
      // Fallback for non-browser / mock environment
      const encoder = new TextEncoder();
      const mockRawId = encoder.encode(`mock-cred-${opts.username}-${Date.now()}`);
      credentialId = Buffer.from(mockRawId).toString("base64url");
      keypair = await this.deriveKeypairFallback(mockRawId, opts.username);
      credentialObj = {
        id: credentialId,
        rawId: mockRawId.buffer as ArrayBuffer,
        type: "public-key",
        response: {
          clientDataJSON: encoder.encode(JSON.stringify({ type: "webauthn.create", origin: "http://localhost" })).buffer,
        },
      };
    }

    return { credentialId, keypair, credential: credentialObj };
  }

  /**
   * Authenticates using a passkey assertion and derives the corresponding Stellar Keypair.
   */
  async authenticatePasskey(opts: PasskeyAssertionOpts & { username?: string }): Promise<{
    keypair: Keypair;
    credentialId: string;
  }> {
    const challenge = opts.challenge ?? crypto.getRandomValues(new Uint8Array(32));

    if (PasskeyManager.isWebAuthnSupported()) {
      const allowCredentials: PublicKeyCredentialDescriptor[] = opts.credentialId
        ? [
            {
              id:
                typeof opts.credentialId === "string"
                  ? (Buffer.from(opts.credentialId, "base64url") as BufferSource)
                  : (opts.credentialId as BufferSource),
              type: "public-key",
            },
          ]
        : [];

      const prfSalt = new TextEncoder().encode(`lumen-passkey-prf-salt:${opts.username ?? "user"}`);
      const prfSaltPadded = new Uint8Array(32);
      prfSaltPadded.set(prfSalt.subarray(0, 32));

      const assertionOptions: PublicKeyCredentialRequestOptions = {
        challenge: challenge as BufferSource,
        allowCredentials,
        userVerification: "preferred",
        extensions: {
          prf: {
            eval: {
              first: prfSaltPadded as BufferSource,
            },
          },
        } as any,
      };

      const assertion = (await navigator.credentials.get({
        publicKey: assertionOptions,
      })) as PublicKeyCredential | null;

      if (!assertion) {
        throw new Error("Passkey authentication canceled or failed.");
      }

      const extensionResults = assertion.getClientExtensionResults
        ? assertion.getClientExtensionResults()
        : {};
      const prfOutput = (extensionResults as any)?.prf?.results?.first;

      const credId = Buffer.from(new Uint8Array(assertion.rawId)).toString("base64url");
      const keypair = await this.deriveKeypairFromWebAuthn({
        credentialId: assertion.rawId,
        clientDataJSON: assertion.response.clientDataJSON,
        prfOutput,
        username: opts.username,
      });

      return { keypair, credentialId: credId };
    } else {
      // Fallback
      const rawId = typeof opts.credentialId === "string"
        ? Buffer.from(opts.credentialId, "base64url")
        : opts.credentialId ?? new TextEncoder().encode("mock-passkey");
      const keypair = await this.deriveKeypairFallback(rawId, opts.username ?? "user");
      const credId = Buffer.from(rawId).toString("base64url");
      return { keypair, credentialId: credId };
    }
  }

  /**
   * Derives a deterministic Ed25519 seed from WebAuthn assertion data or PRF extension output.
   */
  async deriveKeypairFromWebAuthn(opts: {
    credentialId: ArrayBuffer | Uint8Array;
    clientDataJSON?: ArrayBuffer | Uint8Array;
    prfOutput?: ArrayBuffer;
    username?: string;
  }): Promise<Keypair> {
    if (opts.prfOutput && opts.prfOutput.byteLength >= 32) {
      const seed = new Uint8Array(opts.prfOutput).slice(0, 32);
      return Keypair.fromRawEd25519Seed(Buffer.from(seed));
    }

    // Fallback strategy when PRF extension is unavailable
    const rawIdBytes = new Uint8Array(opts.credentialId);
    return this.deriveKeypairFallback(rawIdBytes, opts.username ?? "user");
  }

  /**
   * Fallback key derivation strategy using HMAC-SHA256 over credential ID and username.
   */
  async deriveKeypairFallback(credentialId: Uint8Array, username: string): Promise<Keypair> {
    const encoder = new TextEncoder();
    const secretKeyMaterial = await crypto.subtle.importKey(
      "raw",
      credentialId,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const data = encoder.encode(`lumen-webauthn-fallback-seed:${username}`);
    const signature = await crypto.subtle.sign("HMAC", secretKeyMaterial, data);
    const seed = Buffer.from(new Uint8Array(signature).slice(0, 32));

    return Keypair.fromRawEd25519Seed(seed);
  }
}
