import { describe, it, expect } from "vitest";
import { CosignRequestSchema, FeeBumpRequestSchema, PolicyRequestSchema } from "../validation.js";

describe("validation schemas", () => {
  it("validates valid cosign requests", () => {
    const valid = {
      xdr: "AAAA...",
      walletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    };
    const result = CosignRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid cosign requests", () => {
    const invalid = { xdr: "" };
    const result = CosignRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects cosign requests with invalid Stellar public key", () => {
    const invalidAddress = {
      xdr: "AAAA...",
      walletAddress: "not-a-valid-stellar-address",
    };
    const result = CosignRequestSchema.safeParse(invalidAddress);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.walletAddress).toContain(
        "walletAddress must be a valid Stellar public key",
      );
    }
  });

  it("rejects cosign requests with malformed public key starting with G", () => {
    const invalidAddress = {
      xdr: "AAAA...",
      walletAddress: "GBADCHECKSUMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    };
    const result = CosignRequestSchema.safeParse(invalidAddress);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.walletAddress).toContain(
        "walletAddress must be a valid Stellar public key",
      );
    }
  });

  it("validates valid fee bump requests", () => {
    const valid = { xdr: "AAAA..." };
    const result = FeeBumpRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates policy requests", () => {
    const valid = {
      walletId: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      rules: [
        {
          type: "spend_limit",
          asset: "native",
          maxPerTx: "100",
          maxDaily: "500",
        },
      ],
    };
    const result = PolicyRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates blocklist policy rules", () => {
    const result = PolicyRequestSchema.safeParse({
      walletId: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      rules: [
        {
          type: "blocklist",
          destinations: ["GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
