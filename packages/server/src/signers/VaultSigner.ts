/**
 * VaultSigner — production signer backed by HashiCorp Vault Transit secrets engine.
 *
 * HashiCorp Vault's Transit engine supports Ed25519 natively ("ed25519" key type),
 * making it an ideal HSM for non-custodial Stellar signing where private keys
 * never leave the Vault cluster.
 *
 * References:
 * https://developer.hashicorp.com/vault/docs/secrets/transit
 * https://developer.hashicorp.com/vault/api-docs/secret/transit
 */
import type { Signer, VaultSignerConfig } from "@lumen/types";
import { StrKey } from "@stellar/stellar-sdk";

export class VaultSigner implements Signer {
  private readonly vaultUrl: string;
  private readonly token: string;
  private readonly keyName: string;
  private readonly mountPath: string;
  private readonly namespace?: string;
  private cachedPublicKey: string | null = null;
  private readonly prehashed: boolean;

  constructor(config: VaultSignerConfig) {
    if (!config.vaultUrl || !config.token || !config.keyName) {
      throw new Error(
        "VaultSigner: invalid configuration. vaultUrl, token, and keyName are required."
      );
    }
    this.vaultUrl = config.vaultUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.keyName = config.keyName;
    this.mountPath = config.mountPath ?? "transit";
    this.namespace = config.namespace;
    this.prehashed = Boolean((config as VaultSignerConfig & { prehashed?: boolean }).prehashed);
  }

  static async fromEnv(envPrefix: string = "VAULT"): Promise<VaultSigner> {
    const vaultUrl =
      process.env[`${envPrefix}_ADDR`] ?? process.env[`${envPrefix}_URL`];
    const token = process.env[`${envPrefix}_TOKEN`];
    const keyName = process.env[`${envPrefix}_KEY_NAME`];
    const mountPath = process.env[`${envPrefix}_MOUNT_PATH`] ?? "transit";
    const namespace = process.env[`${envPrefix}_NAMESPACE`];

    if (!vaultUrl) {
      throw new Error(`VaultSigner: ${envPrefix}_ADDR or ${envPrefix}_URL must be set.`);
    }
    if (!token) {
      throw new Error(`VaultSigner: ${envPrefix}_TOKEN must be set.`);
    }
    if (!keyName) {
      throw new Error(`VaultSigner: ${envPrefix}_KEY_NAME must be set.`);
    }

    const signer = new VaultSigner({
      vaultUrl,
      token,
      keyName,
      mountPath,
      namespace,
    });
    await signer.fetchPublicKey();
    return signer;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Vault-Token": this.token,
    };
    if (this.namespace) {
      headers["X-Vault-Namespace"] = this.namespace;
    }
    return headers;
  }

  async fetchPublicKey(): Promise<string> {
    if (this.cachedPublicKey) return this.cachedPublicKey;

    const url = `${this.vaultUrl}/v1/${this.mountPath}/keys/${this.keyName}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `VaultSigner: failed to fetch key ${this.keyName} (status ${res.status}): ${errText}`
      );
    }

    const json = (await res.json()) as {
      data?: {
        latest_version?: number;
        keys?: Record<string, { public_key?: string }>;
      };
    };

    const latestVersion = json.data?.latest_version ?? 1;
    const keyData = json.data?.keys?.[latestVersion.toString()];
    const b64PubKey = keyData?.public_key;

    if (!b64PubKey) {
      throw new Error(
        `VaultSigner: public key not found for version ${latestVersion} of key ${this.keyName}`
      );
    }

    const rawBytes = Buffer.from(b64PubKey, "base64");
    this.cachedPublicKey = StrKey.encodeEd25519PublicKey(rawBytes);
    return this.cachedPublicKey;
  }

  publicKey(): string {
    if (!this.cachedPublicKey) {
      throw new Error(
        "VaultSigner: public key not cached. Call fetchPublicKey() first or use VaultSigner.fromEnv()"
      );
    }
    return this.cachedPublicKey;
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    const url = `${this.vaultUrl}/v1/${this.mountPath}/sign/${this.keyName}`;
    const base64Input = Buffer.from(payload).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        input: base64Input,
        prehashed: this.prehashed,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `VaultSigner: sign operation failed for key ${this.keyName} (status ${res.status}): ${errText}`
      );
    }

    const json = (await res.json()) as {
      data?: {
        signature?: string;
      };
    };

    const signatureString = json.data?.signature;
    if (!signatureString) {
      throw new Error("VaultSigner: response missing signature");
    }

    // Vault signature format: "vault:v1:<base64-encoded-signature>"
    const parts = signatureString.split(":");
    const base64Sig = parts.length >= 3 ? parts[2] : parts[parts.length - 1];

    const sigBuffer = Buffer.from(base64Sig, "base64");
    return new Uint8Array(
      sigBuffer.buffer,
      sigBuffer.byteOffset,
      sigBuffer.byteLength
    );
  }
}
