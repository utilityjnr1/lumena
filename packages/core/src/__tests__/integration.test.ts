import { describe, it, expect } from "vitest";
import { Keypair, Networks, Asset, BASE_FEE, TransactionBuilder, Operation } from "@stellar/stellar-sdk";
import { StellarClient } from "../stellar/client.js";
import { createSponsoredAccount } from "../stellar/account.js";
import { setupMultisig } from "../stellar/multisig.js";
import { buildFeeBump } from "../stellar/transaction.js";
import { KeyManager } from "../keys/manager.js";
import { Wallet } from "../wallet/wallet.js";

const HORIZON_URL = process.env.HORIZON_URL ?? "http://localhost:8000";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8000/rpc";
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

async function isLocalNetworkAvailable(): Promise<boolean> {
  try {
    const res = await fetch(HORIZON_URL, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}
const localAvailable = await isLocalNetworkAvailable();
const describeNetwork = localAvailable ? describe : describe.skip;

async function isServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}
const serverAvailable = await isServerAvailable();
const describeServer = serverAvailable ? describe : describe.skip;

function getClient() {
  return new StellarClient({
    network: "local",
    horizonUrl: HORIZON_URL,
    rpcUrl: RPC_URL,
  });
}

const client = getClient();

async function fundAccount(pubkey: string) {
  try {
    const res = await fetch(`${HORIZON_URL}/friendbot?addr=${pubkey}`);
    await res.json().catch(() => {});
  } catch {
    await client.rpc.requestAirdrop(pubkey);
  }
  for (let i = 0; i < 30; i++) {
    try {
      await client.horizon.loadAccount(pubkey);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

describe("StellarClient", () => {
  const client = getClient();

  it("has correct config for local network", () => {
    expect(client.config.network).toBe("local");
    expect(client.config.networkPassphrase).toBe(Networks.STANDALONE);
    expect(client.horizon).toBeDefined();
    expect(client.rpc).toBeDefined();
  });

  it("exposes networkPassphrase getter", () => {
    expect(client.networkPassphrase).toBe(Networks.STANDALONE);
  });
});

describeNetwork("createSponsoredAccount", () => {
  const client = getClient();

  it("creates a new account with sponsor paying reserves", async () => {
    const sponsor = Keypair.random();
    const newAccount = Keypair.random();

    // Fund sponsor on local network
    await fundAccount(sponsor.publicKey());

    const result = await createSponsoredAccount({
      client,
      sponsorKeypair: sponsor,
      newAccountKeypair: newAccount,
    });

    expect(result.hash).toBeDefined();
    expect(result.address).toBe(newAccount.publicKey());

    // Verify account exists
    const account = await client.horizon.loadAccount(newAccount.publicKey());
    expect(account.accountId()).toBe(newAccount.publicKey());
  });
});

describeNetwork("setupMultisig", () => {
  const client = getClient();

  it("adds a co-signer with 2-of-2 threshold", async () => {
    const sponsor = Keypair.random();
    const account = Keypair.random();
    const coSigner = Keypair.random();

    await fundAccount(sponsor.publicKey());

    // Create account
    await createSponsoredAccount({
      client,
      sponsorKeypair: sponsor,
      newAccountKeypair: account,
    });

    // Setup multisig
    const result = await setupMultisig({
      client,
      accountKeypair: account,
      coSignerPublicKey: coSigner.publicKey(),
      threshold: 2,
    });

    expect(result.hash).toBeDefined();

    // Verify account has the signer and threshold
    const loaded = await client.horizon.loadAccount(account.publicKey());
    const signer = loaded.signers.find(
      (s: any) => s.key === coSigner.publicKey()
    );
    expect(signer).toBeDefined();
    expect(signer!.weight).toBe(1);
    expect(loaded.thresholds.high_threshold).toBe(2);
  });
});

describeNetwork("buildFeeBump", () => {
  const client = getClient();

  it("wraps a transaction in a fee-bump", async () => {
    const sponsor = Keypair.random();
    const source = Keypair.random();
    const destination = Keypair.random();

    await fundAccount(sponsor.publicKey());
    await fundAccount(destination.publicKey());
    await createSponsoredAccount({
      client,
      sponsorKeypair: sponsor,
      newAccountKeypair: source,
    });

    const account = await client.horizon.loadAccount(source.publicKey());

    const innerTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: "1",
        })
      )
      .setTimeout(180)
      .build();

    innerTx.sign(source);

    const feeBump = buildFeeBump({
      feePayerKeypair: sponsor,
      innerTransaction: innerTx,
      networkPassphrase: client.networkPassphrase,
    });

    expect(feeBump).toBeDefined();
    expect(feeBump.toXDR()).toBeDefined();

    // Submit the fee-bump
    const result = await client.horizon.submitTransaction(feeBump);
    expect(result.successful).toBe(true);
  });
});

describe("KeyManager", () => {
  it("generates a random keypair", () => {
    const km = new KeyManager();
    const kp = km.generateKeypair();
    expect(kp.publicKey()).toBeDefined();
    expect(kp.secret()).toBeDefined();
  });

  it("stores and loads a key", async () => {
    const km = new KeyManager();
    const kp = Keypair.random();

    const stored = await km.store(kp, "test");
    expect(stored.publicKey).toBe(kp.publicKey());

    const loaded = await km.load(kp.publicKey(), "test");
    expect(loaded.publicKey()).toBe(kp.publicKey());
  });

  it("lists stored keys", async () => {
    const km = new KeyManager();
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();

    await km.store(kp1, "test");
    await km.store(kp2, "test");

    const keys = km.list();
    expect(keys).toHaveLength(2);
  });
});

describeNetwork("Wallet", () => {
  const client = getClient();

  it("creates a wallet with sponsored account and multisig", async () => {
    const sponsor = Keypair.random();
    const coSigner = Keypair.random();

    await fundAccount(sponsor.publicKey());

    const wallet = new Wallet({
      client,
      sponsorKeypair: sponsor,
      serverPublicKey: coSigner.publicKey(),
    });

    const result = await wallet.create();

    expect(result.address).toBeDefined();
    expect(result.publicKey).toBe(result.address);

    // Verify wallet has balance (0 since sponsored)
    const balance = await wallet.getBalance();
    expect(balance).toBeDefined();
  });
});

describeServer("POST /cosign/batch", () => {
  it("returns one result per batched request", async () => {
    const res = await fetch(`${SERVER_URL}/cosign/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { xdr: "invalid-xdr", walletAddress: Keypair.random().publicKey() },
          { xdr: "invalid-xdr", walletAddress: Keypair.random().publicKey() },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results).toHaveLength(2);
    for (const result of body.results) {
      expect(result).toHaveProperty("approved");
      expect(result).toHaveProperty("reason");
    }
  });
});
