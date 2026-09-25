import { describe, it, expect } from "vitest";
import { openApiSpec } from "../openapi.js";

describe("OpenAPI Specification", () => {
  it("defines openapi version 3.0.3", () => {
    expect(openApiSpec.openapi).toBe("3.0.3");
  });

  it("contains all required server endpoints", () => {
    const paths = Object.keys(openApiSpec.paths);
    expect(paths).toContain("/health");
    expect(paths).toContain("/cosign");
    expect(paths).toContain("/fee-bump");
    expect(paths).toContain("/fee-bump/submit");
    expect(paths).toContain("/wallet/create");
    expect(paths).toContain("/policy");
    expect(paths).toContain("/policy/{walletId}");
    expect(openApiSpec.paths["/policy/{walletId}"]).toHaveProperty("put");
  });

  it("defines valid request and response schemas", () => {
    expect(openApiSpec.components.schemas).toHaveProperty("SpendLimitRule");
    expect(openApiSpec.components.schemas).toHaveProperty("VelocityRule");
    expect(openApiSpec.components.schemas).toHaveProperty("AllowlistRule");
    expect(openApiSpec.components.schemas).toHaveProperty("MaxOperationsRule");
    expect(openApiSpec.components.schemas).toHaveProperty("Policy");
  });

  it("defines bearerAuth security scheme and security requirement", () => {
    expect(openApiSpec.components.securitySchemes).toHaveProperty("bearerAuth");
    expect(openApiSpec.security).toContainEqual({ bearerAuth: [] });
  });
});
