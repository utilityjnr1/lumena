import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { createServer, type ServerResult } from "../server.js";
import { EnvSigner } from "../signers/EnvSigner.js";

describe("Policy deletion API", () => {
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

  it("deletes an existing policy and returns 404 when it is already absent", async () => {
    const walletId = Keypair.random().publicKey();
    const createResponse = await fetch(`${baseUrl}/policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletId,
        rules: [{ type: "max_operations", maxOperations: 2 }],
      }),
    });
    expect(createResponse.status).toBe(201);

    const deleteResponse = await fetch(`${baseUrl}/policy/${walletId}`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(204);

    const getResponse = await fetch(`${baseUrl}/policy/${walletId}`);
    expect(getResponse.status).toBe(404);

    const repeatedDeleteResponse = await fetch(`${baseUrl}/policy/${walletId}`, {
      method: "DELETE",
    });
    expect(repeatedDeleteResponse.status).toBe(404);
  });
});
