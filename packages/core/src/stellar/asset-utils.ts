import { Asset, StrKey } from "@stellar/stellar-sdk";

/**
 * Checks whether the given asset is native XLM.
 * Accepts either an `Asset` instance or a string identifier ('native' or 'XLM').
 */
export function isNativeAsset(asset: Asset | string): boolean {
  if (typeof asset === "string") {
    const trimmed = asset.trim();
    return trimmed.toLowerCase() === "native" || trimmed.toUpperCase() === "XLM";
  }
  return asset.isNative();
}

/**
 * Parses a string representation into a Stellar SDK `Asset` instance.
 * Accepts:
 * - 'native' or 'XLM' for native Lumen asset
 * - 'CODE:ISSUER' for alphanumeric issued assets (code must be 1-12 chars, issuer must be valid 56-character Ed25519 public key)
 */
export function parseAsset(identifier: string): Asset {
  if (!identifier || typeof identifier !== "string") {
    throw new Error("Invalid asset identifier: identifier must be a non-empty string");
  }

  const trimmed = identifier.trim();
  if (isNativeAsset(trimmed)) {
    return Asset.native();
  }

  const parts = trimmed.split(":");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid asset identifier "${identifier}": expected format "CODE:ISSUER" or "native"`,
    );
  }

  const [code, issuer] = parts;
  if (!code || code.length < 1 || code.length > 12 || !/^[a-zA-Z0-9]+$/.test(code)) {
    throw new Error(
      `Invalid asset code "${code}": must be 1-12 alphanumeric characters`,
    );
  }

  if (!issuer || issuer.length !== 56 || !StrKey.isValidEd25519PublicKey(issuer)) {
    throw new Error(
      `Invalid asset issuer "${issuer}": must be a valid 56-character Ed25519 public key`,
    );
  }

  return new Asset(code, issuer);
}

/**
 * Formats a Stellar SDK `Asset` instance into a standard string representation.
 * Returns 'native' for native asset and 'CODE:ISSUER' for issued assets.
 */
export function formatAsset(asset: Asset): string {
  if (asset.isNative()) {
    return "native";
  }
  return `${asset.getCode()}:${asset.getIssuer()}`;
}
