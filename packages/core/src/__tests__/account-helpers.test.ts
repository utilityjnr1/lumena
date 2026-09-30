import { describe, expect, it, vi } from "vitest";
import { Account, Asset, Claimant, Keypair, Networks } from "@stellar/stellar-sdk";
import type { StellarClient } from "../stellar/client.js";
import {
  changeTrust,
  claimClaimableBalance,
  createClaimableBalance,
  mergeAccount,
} from "../stellar/account-helpers.js";

describe("stellar/account-helpers", () => {
  const validBalanceId = "00000000" + "a".repeat(64);

  function createMockClient() {
    const loadAccount = vi.fn().mockImplementation((pubkey: string) => {
      return Promise.resolve(new Account(pubkey, "100"));
    });
    const submitTransaction = vi.fn().mockImplementation((_tx: any) => {
      return Promise.resolve({
        hash: "mock-tx-hash",
        balanceId: validBalanceId,
      });
    });

    const client = {
      horizon: {
        loadAccount,
        submitTransaction,
      },
      networkPassphrase: Networks.TESTNET,
    } as unknown as StellarClient;

    return { client, loadAccount, submitTransaction };
  }

  describe("createClaimableBalance", () => {
    it("submits createClaimableBalance transaction with default unconditional predicate", async () => {
      const { client, loadAccount, submitTransaction } = createMockClient();
      const sourceKeypair = Keypair.random();
      const claimantPubkey = Keypair.random().publicKey();

      const result = await createClaimableBalance({
        client,
        sourceKeypair,
        asset: Asset.native(),
        amount: "10.5000000",
        claimants: [{ destination: claimantPubkey }],
      });

      expect(loadAccount).toHaveBeenCalledWith(sourceKeypair.publicKey());
      expect(submitTransaction).toHaveBeenCalledTimes(1);
      const tx = submitTransaction.mock.calls[0][0];
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0].type).toBe("createClaimableBalance");
      expect(tx.operations[0].asset.isNative()).toBe(true);
      expect(tx.operations[0].amount).toBe("10.5000000");
      expect(tx.operations[0].claimants).toHaveLength(1);
      expect(tx.operations[0].claimants[0].destination).toBe(claimantPubkey);
      expect(result.hash).toBe("mock-tx-hash");
      expect(result.balanceId).toBe(validBalanceId);
    });

    it("submits createClaimableBalance with custom predicate", async () => {
      const { client, submitTransaction } = createMockClient();
      const sourceKeypair = Keypair.random();
      const claimantPubkey = Keypair.random().publicKey();
      const predicate = Claimant.predicateBeforeRelativeTime("3600");

      const result = await createClaimableBalance({
        client,
        sourceKeypair,
        asset: new Asset("USDC", Keypair.random().publicKey()),
        amount: "50",
        claimants: [{ destination: claimantPubkey, predicate }],
      });

      expect(submitTransaction).toHaveBeenCalledTimes(1);
      const tx = submitTransaction.mock.calls[0][0];
      expect(tx.operations[0].claimants[0].predicate).toEqual(predicate);
      expect(result.hash).toBe("mock-tx-hash");
    });

    it("handles response without balanceId gracefully", async () => {
      const { client, submitTransaction } = createMockClient();
      submitTransaction.mockResolvedValueOnce({ hash: "mock-hash-no-id" });
      const sourceKeypair = Keypair.random();
      const claimantPubkey = Keypair.random().publicKey();

      const result = await createClaimableBalance({
        client,
        sourceKeypair,
        asset: Asset.native(),
        amount: "1",
        claimants: [{ destination: claimantPubkey }],
      });

      expect(result.hash).toBe("mock-hash-no-id");
      expect(result.balanceId).toBeUndefined();
    });
  });

  describe("changeTrust", () => {
    it("submits changeTrust transaction", async () => {
      const { client, submitTransaction } = createMockClient();
      const sourceKeypair = Keypair.random();
      const asset = new Asset("USDC", Keypair.random().publicKey());

      const res = await changeTrust({ client, sourceKeypair, asset, limit: "1000" });
      expect(res.hash).toBe("mock-tx-hash");
      expect(submitTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("claimClaimableBalance", () => {
    it("submits claimClaimableBalance transaction", async () => {
      const { client, submitTransaction } = createMockClient();
      const claimantKeypair = Keypair.random();

      const res = await claimClaimableBalance({
        client,
        claimantKeypair,
        balanceId: validBalanceId,
      });
      expect(res.hash).toBe("mock-tx-hash");
      expect(submitTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("mergeAccount", () => {
    it("submits accountMerge transaction", async () => {
      const { client, submitTransaction } = createMockClient();
      const sourceKeypair = Keypair.random();
      const destination = Keypair.random().publicKey();

      const res = await mergeAccount({ client, sourceKeypair, destination });
      expect(res.hash).toBe("mock-tx-hash");
      expect(submitTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
