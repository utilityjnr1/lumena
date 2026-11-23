import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Account, Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { createServer, type ServerResult } from "../server.js";
import { EnvSigner } from "../signers/EnvSigner.js";
import { signTestToken } from "./helpers/jwt.js";

describe("Wallet closure API", () => {
  const cosignerKeypair = Keypair.random();
  const feePayerKeypair = Keypair.random();
  const sponsor = feePayerKeypair.publicKey();
  const issuer = Keypair.random().publicKey();
  const destination = Keypair.random().publicKey();
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${signTestToken({ sub: "operator-1", roles: ["operator"] })}`,
  };

  const accounts = new Map<string, Record<string, unknown>>();
  let serverResult: ServerResult;
  let baseUrl: string;

  function addWallet(trustlineBalance = "0.0000000"): string {
    const wallet = Keypair.random().publicKey();
    accounts.set(wallet, {
      sponsor,
      balances: [
        { asset_type: "native", balance: "9.5000000" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: issuer,
          balance: trustlineBalance,
          sponsor,
        },
      ],
      signers: [
        { key: wallet, type: "ed25519_public_key", weight: 1 },
        { key: cosignerKeypair.publicKey(), type: "ed25519_public_key", weight: 1, sponsor },
      ],
      data_attr: {},
    });
    return wallet;
  }

  function closeWallet(wallet: string, body: unknown) {
    return fetch(`${baseUrl}/wallets/${wallet}/close`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    serverResult = createServer({
      port: 0,
      network: "local",
      cosignerSigner: new EnvSigner(cosignerKeypair.secret()),
      feePayerSigner: new EnvSigner(feePayerKeypair.secret()),
    });
    accounts.set(destination, { balances: [], signers: [] });
    accounts.set(sponsor, {
      balances: [{ asset_type: "native", balance: "100.0000000" }],
      signers: [],
    });
    vi.spyOn(serverResult.client.horizon, "loadAccount").mockImplementation(async (id: string) => {
      const record = accounts.get(id);
      if (!record) {
        throw Object.assign(new Error("Not Found"), { response: { status: 404 } });
      }
      return Object.assign(new Account(id, "100"), record) as never;
    });

    await new Promise<void>((resolve) => serverResult.server.once("listening", resolve));
    const address = serverResult.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Wallet closure test server did not bind to a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    serverResult.sponsorMonitorService.stop();
    await new Promise<void>((resolve) => serverResult.server.close(() => resolve()));
  });

  it("builds a co-signed close transaction and writes an audit entry", async () => {
    const wallet = addWallet();

    const response = await closeWallet(wallet, { destination });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      txHash: string;
      xdr: string;
      reclaimedReserves: number;
      reclaimedXlm: number;
    };

    expect(body.reclaimedReserves).toBe(4);
    expect(body.reclaimedXlm).toBe(2);

    const tx = TransactionBuilder.fromXDR(
      body.xdr,
      serverResult.client.networkPassphrase,
    ) as Transaction;
    expect(tx.source).toBe(wallet);
    expect(tx.operations.map((op) => op.type)).toEqual([
      "changeTrust",
      "setOptions",
      "accountMerge",
    ]);
    expect(tx.operations[2]).toMatchObject({ type: "accountMerge", destination });
    expect(tx.signatures).toHaveLength(1);
    expect(cosignerKeypair.verify(tx.hash(), tx.signatures[0]!.signature())).toBe(true);

    const record = serverResult.auditLog.getRecords().at(-1);
    expect(record).toMatchObject({
      txHash: body.txHash,
      walletAddress: wallet,
      decision: "approved",
    });
    expect(record?.rulesEvaluated).toContain("wallet:close");
  });

  it("validates the funds destination", async () => {
    const wallet = addWallet();

    expect((await closeWallet(wallet, { destination: "not-a-key" })).status).toBe(400);
    expect((await closeWallet(wallet, { destination: wallet })).status).toBe(400);
    expect(
      (await closeWallet(wallet, { destination: Keypair.random().publicKey() })).status,
    ).toBe(400);
  });

  it("refuses to close a wallet holding non-native balances", async () => {
    const wallet = addWallet("12.5000000");

    expect((await closeWallet(wallet, { destination })).status).toBe(400);
  });

  it("returns 404 for an unknown wallet", async () => {
    const response = await closeWallet(Keypair.random().publicKey(), { destination });
    expect(response.status).toBe(404);
  });

  it("rejects closure denied by policy and audits the rejection", async () => {
    const wallet = addWallet();
    const policyResponse = await fetch(`${baseUrl}/policy`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        walletId: wallet,
        rules: [{ type: "max_operations", maxOperations: 1 }],
      }),
    });
    expect(policyResponse.status).toBe(201);

    const response = await closeWallet(wallet, { destination });
    expect(response.status).toBe(403);

    const record = serverResult.auditLog.getRecords().at(-1);
    expect(record).toMatchObject({ walletAddress: wallet, decision: "rejected" });
  });
});
