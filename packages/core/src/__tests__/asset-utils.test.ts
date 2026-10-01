import { describe, expect, it } from "vitest";
import { Asset, Keypair } from "@stellar/stellar-sdk";
import { formatAsset, isNativeAsset, parseAsset } from "../stellar/asset-utils.js";

describe("stellar/asset-utils", () => {
  const validIssuer = Keypair.random().publicKey();

  describe("isNativeAsset", () => {
    it("returns true for Asset.native()", () => {
      expect(isNativeAsset(Asset.native())).toBe(true);
    });

    it("returns false for issued Asset", () => {
      const asset = new Asset("USDC", validIssuer);
      expect(isNativeAsset(asset)).toBe(false);
    });

    it("returns true for 'native' and 'XLM' strings (case insensitive)", () => {
      expect(isNativeAsset("native")).toBe(true);
      expect(isNativeAsset("Native")).toBe(true);
      expect(isNativeAsset("NATIVE")).toBe(true);
      expect(isNativeAsset("XLM")).toBe(true);
      expect(isNativeAsset("xlm")).toBe(true);
    });

    it("returns false for other asset strings", () => {
      expect(isNativeAsset(`USDC:${validIssuer}`)).toBe(false);
      expect(isNativeAsset("USD")).toBe(false);
    });
  });

  describe("parseAsset", () => {
    it("parses 'native' into native Asset", () => {
      const asset = parseAsset("native");
      expect(asset.isNative()).toBe(true);
    });

    it("parses 'XLM' into native Asset", () => {
      const asset = parseAsset("XLM");
      expect(asset.isNative()).toBe(true);
    });

    it("parses valid alphanumeric 4-character code asset", () => {
      const asset = parseAsset(`USDC:${validIssuer}`);
      expect(asset.isNative()).toBe(false);
      expect(asset.getCode()).toBe("USDC");
      expect(asset.getIssuer()).toBe(validIssuer);
    });

    it("parses valid alphanumeric 12-character code asset", () => {
      const code = "LONGASSET123";
      const asset = parseAsset(`${code}:${validIssuer}`);
      expect(asset.getCode()).toBe(code);
      expect(asset.getIssuer()).toBe(validIssuer);
    });

    it("throws on empty or non-string input", () => {
      expect(() => parseAsset("")).toThrow("Invalid asset identifier");
      expect(() => parseAsset("   ")).toThrow("Invalid asset identifier");
    });

    it("throws when missing colon separator", () => {
      expect(() => parseAsset("USDC")).toThrow("expected format");
      expect(() => parseAsset(validIssuer)).toThrow("expected format");
    });

    it("throws when too many colon separators", () => {
      expect(() => parseAsset(`USDC:${validIssuer}:EXTRA`)).toThrow("expected format");
    });

    it("throws when code is invalid or empty", () => {
      expect(() => parseAsset(`:${validIssuer}`)).toThrow("Invalid asset code");
      expect(() => parseAsset(`TOOLONGLONGASSETNAME:${validIssuer}`)).toThrow("Invalid asset code");
      expect(() => parseAsset(`INVALID#:${validIssuer}`)).toThrow("Invalid asset code");
    });

    it("throws when issuer is not a valid 56-character Ed25519 public key", () => {
      expect(() => parseAsset("USDC:NOT_A_VALID_KEY")).toThrow("Invalid asset issuer");
      expect(() => parseAsset("USDC:G12345")).toThrow("Invalid asset issuer");
      expect(() =>
        parseAsset("USDC:SBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
      ).toThrow("Invalid asset issuer");
    });
  });

  describe("formatAsset", () => {
    it("formats native asset as 'native'", () => {
      expect(formatAsset(Asset.native())).toBe("native");
    });

    it("formats issued asset as 'CODE:ISSUER'", () => {
      const asset = new Asset("USDC", validIssuer);
      expect(formatAsset(asset)).toBe(`USDC:${validIssuer}`);
    });
  });
});
