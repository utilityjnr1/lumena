import { describe, expect, it, vi } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import type { StellarClient } from "@lumen/core";
import type { WebhookDispatcher } from "../webhook/dispatcher.js";
import { FeeSponsorService } from "../fee-sponsor/service.js";
import { EnvSigner } from "../signers/EnvSigner.js";

describe("FeeSponsorService webhook events", () => {
  it("dispatches the fee-bump submitted event after successful network submission", async () => {
    const feePayer = Keypair.random();
    const source = Keypair.random();
    const transaction = new TransactionBuilder(new Account(source.publicKey(), "1"), {
      fee: BASE_FEE,
      networkPassphrase: Networks.STANDALONE,
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(180)
      .build();
    transaction.sign(source);

    const dispatch = vi.fn().mockResolvedValue([]);
    const webhookDispatcher = { dispatch } as unknown as WebhookDispatcher;
    const client = {
      networkPassphrase: Networks.STANDALONE,
      horizon: {
        submitTransaction: vi.fn().mockResolvedValue({ successful: true, hash: "fee-bump-hash" }),
      },
    } as unknown as StellarClient;

    const service = new FeeSponsorService({
      client,
      signer: new EnvSigner(feePayer.secret()),
      webhookDispatcher,
    });

    await expect(service.submit(transaction.toXDR())).resolves.toEqual({
      hash: "fee-bump-hash",
      feeBumpHash: "fee-bump-hash",
    });
    expect(dispatch).toHaveBeenCalledWith("transaction.fee_bump.submitted", {
      feeSource: feePayer.publicKey(),
      hash: "fee-bump-hash",
      feeBumpHash: "fee-bump-hash",
    });
  });
});
