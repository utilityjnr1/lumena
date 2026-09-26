import { useCallback, useState } from "react";
import type { PasskeyRegistrationOpts, PasskeyWalletResult } from "@lumen/web-sdk";
import { useLumen } from "./context.js";

export interface UseCreateWalletWithPasskeyResult {
  createWalletWithPasskey: (opts?: PasskeyRegistrationOpts) => Promise<PasskeyWalletResult>;
  loading: boolean;
  error: Error | null;
  data: PasskeyWalletResult | undefined;
  reset: () => void;
}

export function useCreateWalletWithPasskey(): UseCreateWalletWithPasskeyResult {
  const { client } = useLumen();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<PasskeyWalletResult>();

  const createWalletWithPasskey = useCallback(
    async (opts?: PasskeyRegistrationOpts): Promise<PasskeyWalletResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await client.createWalletWithPasskey(opts);
        setData(result);
        return result;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        throw normalized;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(undefined);
  }, []);

  return { createWalletWithPasskey, loading, error, data, reset };
}
