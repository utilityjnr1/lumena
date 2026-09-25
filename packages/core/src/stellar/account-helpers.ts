import type { Asset, Keypair } from "@stellar/stellar-sdk";
import { BASE_FEE, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import type { StellarClient } from "./client.js";

export interface TrustlineOpts {
  client: StellarClient;
  sourceKeypair: Keypair;
  asset: Asset;
  limit?: string;
}

export async function changeTrust(opts: TrustlineOpts): Promise<{ hash: string }> {
  const { client, sourceKeypair, asset, limit } = opts;
  const account = await client.horizon.loadAccount(sourceKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset, limit }))
    .setTimeout(180)
    .build();
  tx.sign(sourceKeypair);
  const result = await client.horizon.submitTransaction(tx);
  return { hash: result.hash };
}

export interface ClaimClaimableBalanceOpts {
  client: StellarClient;
  claimantKeypair: Keypair;
  balanceId: string;
}

export async function claimClaimableBalance(
  opts: ClaimClaimableBalanceOpts,
): Promise<{ hash: string }> {
  const { client, claimantKeypair, balanceId } = opts;
  const account = await client.horizon.loadAccount(claimantKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(Operation.claimClaimableBalance({ balanceId }))
    .setTimeout(180)
    .build();
  tx.sign(claimantKeypair);
  const result = await client.horizon.submitTransaction(tx);
  return { hash: result.hash };
}

export interface MergeAccountOpts {
  client: StellarClient;
  sourceKeypair: Keypair;
  destination: string;
}

export async function mergeAccount(opts: MergeAccountOpts): Promise<{ hash: string }> {
  const { client, sourceKeypair, destination } = opts;
  const account = await client.horizon.loadAccount(sourceKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(Operation.accountMerge({ destination }))
    .setTimeout(180)
    .build();
  tx.sign(sourceKeypair);
  const result = await client.horizon.submitTransaction(tx);
  return { hash: result.hash };
}
