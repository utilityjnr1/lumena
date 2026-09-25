import type {
  Keypair,
  Asset,
} from "@stellar/stellar-sdk";
import {
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import type { StellarClient } from "./client.js";

export interface PathPaymentOpts {
  client: StellarClient;
  sourceKeypair: Keypair;
  destination: string;
  sendAsset: Asset;
  sendAmount: string;
  destAsset: Asset;
  destMin: string;
  path?: Asset[];
}

export async function pathPayment(opts: PathPaymentOpts): Promise<{ hash: string }> {
  const { client, sourceKeypair, destination, sendAsset, sendAmount, destAsset, destMin, path = [] } = opts;

  const account = await client.horizon.loadAccount(sourceKeypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset,
        sendAmount,
        destination,
        destAsset,
        destMin,
        path,
      })
    )
    .setTimeout(180)
    .build();

  tx.sign(sourceKeypair);

  const result = await client.horizon.submitTransaction(tx);

  if (result.successful) {
    return { hash: result.hash };
  }

  throw new Error(`Path payment failed: ${result.hash}`);
}

export async function pathPaymentStrictReceive(opts: PathPaymentOpts): Promise<{ hash: string }> {
  const { client, sourceKeypair, destination, sendAsset, sendAmount, destAsset, destMin, path = [] } = opts;
  const account = await client.horizon.loadAccount(sourceKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset,
        sendMax: sendAmount,
        destination,
        destAsset,
        destAmount: destMin,
        path,
      })
    )
    .setTimeout(180)
    .build();
  tx.sign(sourceKeypair);
  const result = await client.horizon.submitTransaction(tx);
  if (result.successful) return { hash: result.hash };
  throw new Error(`Strict receive path payment failed: ${result.hash}`);
}

export async function findPaths(
  client: StellarClient,
  source: string,
  destAsset: Asset,
  destAmount: string
): Promise<Array<{ path: string[]; source_amount: string }>> {
  const response = await client.horizon
    .strictReceivePaths(source, destAsset, destAmount)
    .call();

  return response.records.map((r: any) => ({
    path: r.path.map((a: any) => `${a.asset_code}:${a.asset_issuer}`),
    source_amount: r.source_amount,
  }));
}
