import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import type { AddressInfo } from "node:net";
import { createServer, type ServerResult } from "../server.js";
import { EnvSigner } from "../signers/EnvSigner.js";

describe("API Key Authentication & Rate Limiting Middleware", () => {
  const cosignerKeypair = Keypair.random();
  const feePayerKeypair = Keypair.random();
  const apiKey = "test-secret-key-12345";
  let serverResult: ServerResult;
  let baseUrl: string;

  beforeAll(async () => {
    serverResult = createServer({
      port: 0,
      network: "local",
      cosignerSigner: new EnvSigner(cosignerKeypair.secret()),
      feePayerSigner: new EnvSigner(feePayerKeypair.secret()),
      apiKey,
      windowMs: 60000,
      max: 2,
    });

    await new Promise((r) => setTimeout(r, 100));
    const addr = serverResult.server.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
  });

  afterAll(async () => {
    serverResult.sponsorMonitorService?.stop();
    await new Promise<void>((resolve) => serverResult.server.close(() => resolve()));
  });

  it("allows /health without an API key", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("does not allow cross-origin requests by default", async () => {
    const res = await fetch(`${baseUrl}/cosign`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows /metrics without an API key", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
  });

  it("rejects protected endpoint with 401 when Authorization header is missing", async () => {
    const res = await fetch(`${baseUrl}/sponsor/status`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects protected endpoint with 401 when Bearer token is invalid", async () => {
    const res = await fetch(`${baseUrl}/sponsor/status`, {
      headers: { Authorization: "Bearer wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects protected endpoint with 401 when scheme is not Bearer", async () => {
    const res = await fetch(`${baseUrl}/sponsor/status`, {
      headers: { Authorization: `Basic ${apiKey}` },
    });
    expect(res.status).toBe(401);
  });

  it("allows protected endpoint when valid Authorization Bearer header is provided", async () => {
    const res = await fetch(`${baseUrl}/sponsor/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(200);
  });

  it("enforces rate limiting on /fee-bump endpoint and returns 429", async () => {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // First request
    const r1 = await fetch(`${baseUrl}/fee-bump`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(r1.status).toBe(400); // validation error, but passed rate limit

    // Second request
    const r2 = await fetch(`${baseUrl}/fee-bump`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(r2.status).toBe(400);

    // Third request exceeds limit of 2
    const r3 = await fetch(`${baseUrl}/fee-bump`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(r3.status).toBe(429);
    const body = await r3.json();
    expect(body.error).toBe("Too Many Requests");
  });
});
