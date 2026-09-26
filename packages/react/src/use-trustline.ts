import { useCallback, useEffect, useState } from "react";
import { useLumen } from "./context.js";

export interface UseTrustlineResult {
  /** Whether the wallet currently holds a trustline for the specified asset. */
  hasTrustline: boolean;
  /** Current balance for this asset, or '0' if the trustline does not exist. */
  balance: string;
  /**
   * Establish a trustline for the asset.
   * @param limit - Optional balance limit. Omit to use the Stellar default (max uint64).
   */
  addTrustline: (limit?: string) => Promise<void>;
  /**
   * Remove the trustline for the asset by setting the limit to '0'.
   * The wallet balance for this asset must be zero before calling this.
   */
  removeTrustline: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Checks whether a wallet has an active trustline for the given asset code and
 * issuer, and provides helpers to add or remove the trustline.
 *
 * @param walletId  - The wallet's Stellar account address.
 * @param assetCode - The asset code to check (e.g. 'USDC').
 * @param issuer    - The Stellar public key of the asset issuer.
 *
 * @example
 * ```tsx
 * const { hasTrustline, balance, addTrustline } = useTrustline(
 *   walletId,
 *   'USDC',
 *   'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
 * );
 *
 * if (!hasTrustline) {
 *   await addTrustline();
 * }
 * ```
 */
export function useTrustline(
  walletId: string,
  assetCode: string,
  issuer: string,
): UseTrustlineResult {
  const { client } = useLumen();

  const [hasTrustline, setHasTrustline] = useState<boolean>(false);
  const [balance, setBalance] = useState<string>("0");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // getBalance returns '0' when the trustline does not exist.
      // We use the balance to determine trustline presence by querying the
      // wallet's full account object via the existing getBalance API.
      // A non-zero balance or a successful (non-throwing) call with a known
      // asset means the trustline exists.
      //
      // LumenClient.getBalance throws for unknown assets (not in KNOWN_ASSETS),
      // so for arbitrary issuer/asset pairs we query the Horizon endpoint via
      // the generic client.get() path instead.
      let fetchedBalance = "0";
      let trustlineFound = false;

      try {
        fetchedBalance = await client.getBalance(walletId, assetCode);
        // If no error is thrown and we got a result, a KNOWN_ASSETS trustline
        // for this assetCode exists (even if balance is "0").
        trustlineFound = true;
      } catch {
        // Asset may not be in KNOWN_ASSETS; fall back to Horizon query below.
      }

      if (!trustlineFound) {
        // Fall back: fetch account data from Horizon via server proxy.
        try {
          const accountData = await client.get<{
            balances?: Array<{
              asset_type: string;
              asset_code?: string;
              asset_issuer?: string;
              balance: string;
            }>;
          }>(`/wallet/${walletId}/account`);

          const matchingBalance = accountData.balances?.find(
            (b) => b.asset_code === assetCode && b.asset_issuer === issuer,
          );

          if (matchingBalance) {
            trustlineFound = true;
            fetchedBalance = matchingBalance.balance;
          }
        } catch {
          // Server proxy endpoint not available; trustline status unknown.
        }
      }

      setHasTrustline(trustlineFound);
      setBalance(fetchedBalance);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client, walletId, assetCode, issuer]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const addTrustline = useCallback(
    async (limit?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await client.changeTrust(walletId, assetCode, issuer, limit);
        // Refresh state after successful trustline creation.
        await refetch();
      } catch (err) {
        const normalizedError = err instanceof Error ? err : new Error(String(err));
        setError(normalizedError);
        setIsLoading(false);
        throw normalizedError;
      }
    },
    [client, walletId, assetCode, issuer, refetch],
  );

  const removeTrustline = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await client.changeTrust(walletId, assetCode, issuer, "0");
      // Refresh state after successful trustline removal.
      await refetch();
    } catch (err) {
      const normalizedError = err instanceof Error ? err : new Error(String(err));
      setError(normalizedError);
      setIsLoading(false);
      throw normalizedError;
    }
  }, [client, walletId, assetCode, issuer, refetch]);

  return {
    hasTrustline,
    balance,
    addTrustline,
    removeTrustline,
    isLoading,
    error,
    refetch,
  };
}
