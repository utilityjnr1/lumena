/**
 * GcpKmsSigner — production signer backed by Google Cloud KMS.
 *
 * Implements the Signer interface for Stellar transactions using Google Cloud
 * Key Management Service (KMS). Uses asymmetric signing where the private key
 * never leaves the Google Cloud HSM boundary.
 */
import type { Signer, GcpKmsSignerConfig } from "@lumen/types";
import { StrKey } from "@stellar/stellar-sdk";

function extractEd25519PublicKey(bytes: Buffer): Buffer {
  return bytes.length === 32 ? bytes : bytes.slice(-32);
}

export class GcpKmsSigner implements Signer {
  private readonly config: GcpKmsSignerConfig;
  private readonly resourceName: string;
  private readonly endpoint: string;
  private cachedPublicKey: string | null = null;
  private accessToken?: string;

  constructor(config: GcpKmsSignerConfig, accessToken?: string) {
    this.config = config;
    this.accessToken = accessToken;
    this.endpoint = config.endpoint ?? "https://cloudkms.googleapis.com";

    if (config.keyResourceName) {
      this.resourceName = config.keyResourceName;
    } else if (
      config.projectId &&
      config.locationId &&
      config.keyRingId &&
      config.keyId &&
      config.keyVersion
    ) {
      this.resourceName = `projects/${config.projectId}/locations/${config.locationId}/keyRings/${config.keyRingId}/cryptoKeys/${config.keyId}/cryptoKeyVersions/${config.keyVersion}`;
    } else {
      throw new Error(
        "GcpKmsSigner: invalid configuration. Provide keyResourceName or all individual resource parameters."
      );
    }
  }

  static async fromEnv(envPrefix: string = "GCP_KMS"): Promise<GcpKmsSigner> {
    const keyResourceName = process.env[`${envPrefix}_KEY_RESOURCE_NAME`];
    const projectId = process.env[`${envPrefix}_PROJECT_ID`];
    const locationId = process.env[`${envPrefix}_LOCATION_ID`];
    const keyRingId = process.env[`${envPrefix}_KEY_RING_ID`];
    const keyId = process.env[`${envPrefix}_KEY_ID`];
    const keyVersion = process.env[`${envPrefix}_KEY_VERSION`];
    const endpoint = process.env[`${envPrefix}_ENDPOINT`];
    const accessToken = process.env[`${envPrefix}_ACCESS_TOKEN`];

    const config: GcpKmsSignerConfig = {
      keyResourceName,
      projectId,
      locationId,
      keyRingId,
      keyId,
      keyVersion,
      endpoint,
    };

    const signer = new GcpKmsSigner(config, accessToken);
    await signer.fetchPublicKey();
    return signer;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = this.accessToken || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async fetchPublicKey(): Promise<string> {
    if (this.cachedPublicKey) return this.cachedPublicKey;

    const url = `${this.endpoint}/v1/${this.resourceName}/publicKey`;
    const headers = await this.getAuthHeaders();

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `GcpKmsSigner: failed to fetch public key (status ${res.status}): ${errText}`
      );
    }

    const data = (await res.json()) as { pem?: string; rawPublicKey?: string };
    if (data.rawPublicKey) {
      const rawBytes = extractEd25519PublicKey(Buffer.from(data.rawPublicKey, "base64"));
      this.cachedPublicKey = StrKey.encodeEd25519PublicKey(rawBytes);
      return this.cachedPublicKey;
    }

    if (data.pem) {
      // Extract DER bytes from PEM
      const pemClean = data.pem
        .replace(/-----BEGIN[ A-Z0-9_-]+-----/g, "")
        .replace(/-----END[ A-Z0-9_-]+-----/g, "")
        .replace(/\s+/g, "");
      const derBuffer = Buffer.from(pemClean, "base64");
      // Ed25519 SPKI DER typically has 32-byte public key as the trailing 32 bytes
      const rawBytes = extractEd25519PublicKey(derBuffer);
      this.cachedPublicKey = StrKey.encodeEd25519PublicKey(rawBytes);
      return this.cachedPublicKey;
    }

    throw new Error("GcpKmsSigner: received invalid public key response from Cloud KMS");
  }

  publicKey(): string {
    if (!this.cachedPublicKey) {
      throw new Error(
        "GcpKmsSigner: public key not cached. Call fetchPublicKey() first or use GcpKmsSigner.fromEnv()"
      );
    }
    return this.cachedPublicKey;
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    const url = `${this.endpoint}/v1/${this.resourceName}:asymmetricSign`;
    const headers = await this.getAuthHeaders();

    const body = JSON.stringify({
      data: Buffer.from(payload).toString("base64"),
    });

    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `GcpKmsSigner: asymmetricSign call failed (status ${res.status}): ${errText}`
      );
    }

    const data = (await res.json()) as { signature: string };
    if (!data.signature) {
      throw new Error("GcpKmsSigner: response missing signature field");
    }

    const signatureBuffer = Buffer.from(data.signature, "base64");
    return new Uint8Array(
      signatureBuffer.buffer,
      signatureBuffer.byteOffset,
      signatureBuffer.byteLength
    );
  }
}
