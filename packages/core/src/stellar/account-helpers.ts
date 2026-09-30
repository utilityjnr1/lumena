import type { Asset, Keypair } from "@stellar/stellar-sdk";
import { BASE_FEE, Claimant, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
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

export interface CreateClaimableBalanceOpts {
  client: StellarClient;
  sourceKeypair: Keypair;
  asset: Asset;
  amount: string;
  claimants: Array<{
    destination: string;
    predicate?: any; // ClaimantPredicate
  }>;
}

export async function createClaimableBalance(
  opts: CreateClaimableBalanceOpts,
): Promise<{ hash: string; balanceId?: string }> {
  const { client, sourceKeypair, asset, amount, claimants } = opts;
  const account = await client.horizon.loadAccount(sourceKeypair.publicKey());
  const claimantList = claimants.map((c) =>
    c instanceof Claimant
      ? c
      : new Claimant(c.destination, c.predicate ?? Claimant.predicateUnconditional()),
  );
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(
      Operation.createClaimableBalance({
        asset,
        amount,
        claimants: claimantList,
      }),
    )
    .setTimeout(180)
    .build();
  tx.sign(sourceKeypair);
  const result = await client.horizon.submitTransaction(tx);

  let balanceId: string | undefined =
    (result as any).balanceId ?? (result as any).claimable_balance_id;

  if (!balanceId) {
    try {
      const txResultXdr = (result as any).result_xdr ?? (result as any).resultXdr;
      if (txResultXdr) {
        const txResult = xdr.TransactionResult.fromXDR(txResultXdr, "base64");
        const resultVal = (txResult as any).result?.();
        const opResults = (typeof resultVal?.results === "function" ? resultVal.results() : []) as any[];
        for (const opResult of opResults) {
          const tr = typeof opResult.tr === "function" ? opResult.tr() : undefined;
          if (tr) {
            try {
              const createResult = typeof tr.createClaimableBalanceResult === "function"
                ? tr.createClaimableBalanceResult()
                : undefined;
              if (
                createResult &&
                createResult.switch?.().name === "createClaimableBalanceSuccess"
              ) {
                const idXdr = createResult.balanceId();
                balanceId = typeof idXdr.toXDR === "function" ? idXdr.toXDR("hex") : String(idXdr);
                break;
              }
            } catch {
              // Not createClaimableBalance op result
            }
          }
        }
      }
    } catch {
      // Parsing error ignored
    }
  }

  return { hash: result.hash, balanceId };
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
