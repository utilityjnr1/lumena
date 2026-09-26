import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { createServer, type ServerResult } from "../server.js";
import { EnvSigner } from "../signers/EnvSigner.js";

describe("Policy API", () => {
  let serverResult: ServerResult;
  let baseUrl: string;

  beforeAll(async () => {
    const cosignerKeypair = Keypair.random();
    const feePayerKeypair = Keypair.random();
    serverResult = createServer({
      port: 0,
      network: "local",
      cosignerSigner: new EnvSigner(cosignerKeypair.secret()),
      feePayerSigner: new EnvSigner(feePayerKeypair.secret()),
    });
    await new Promise<void>((resolve) => serverResult.server.once("listening", resolve));
    const address = serverResult.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Policy API test server did not bind to a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    serverResult.sponsorMonitorService.stop();
    await new Promise<void>((resolve) => serverResult.server.close(() => resolve()));
  });

  it("updates an existing policy with PUT without changing its identity", async () => {
    const walletId = Keypair.random().publicKey();
    const initialRules = [{ type: "max_operations", maxOperations: 2 }];
    const createResponse = await fetch(`${baseUrl}/policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId, rules: initialRules }),
    });
    expect(createResponse.status).toBe(201);
    const createdPolicy = await createResponse.json();

    const updatedRules = [{ type: "max_operations", maxOperations: 5 }];
    const updateResponse = await fetch(`${baseUrl}/policy/${walletId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId, rules: updatedRules }),
    });

    expect(updateResponse.status).toBe(200);
    const updatedPolicy = await updateResponse.json();
    expect(updatedPolicy).toMatchObject({
      id: createdPolicy.id,
      walletId,
      rules: updatedRules,
      createdAt: createdPolicy.createdAt,
    });

    const duplicateResponse = await fetch(`${baseUrl}/policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId, rules: initialRules }),
    });
    expect(duplicateResponse.status).toBe(409);
  });

  it("requires an existing policy and matching URL walletId for PUT", async () => {
    const walletId = Keypair.random().publicKey();
    const missingResponse = await fetch(`${baseUrl}/policy/${walletId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletId,
        rules: [{ type: "max_operations", maxOperations: 2 }],
      }),
    });
    expect(missingResponse.status).toBe(404);

    const existingWalletId = Keypair.random().publicKey();
    await fetch(`${baseUrl}/policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletId: existingWalletId,
        rules: [{ type: "max_operations", maxOperations: 2 }],
      }),
    });

    const mismatchResponse = await fetch(`${baseUrl}/policy/${existingWalletId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletId,
        rules: [{ type: "max_operations", maxOperations: 3 }],
      }),
    });
    expect(mismatchResponse.status).toBe(400);
  });
});
