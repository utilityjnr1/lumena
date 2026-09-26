import { useCallback, useState } from "react";
import { useLumen } from "./context.js";

export interface CreateWalletResult {
  address: string;
  id: string;
}

export interface UseCreateWalletResult {
  createWallet: () => Promise<CreateWalletResult>;
  loading: boolean;
  error: Error | null;
  data: CreateWalletResult | undefined;
  reset: () => void;
}

export function useCreateWallet(): UseCreateWalletResult {
  const { client } = useLumen();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<CreateWalletResult>();

  const createWallet = useCallback(async (): Promise<CreateWalletResult> => {
    setLoading(true);
    setError(null);

    try {
      const result = await client.createWallet();
      setData(result);
      return result;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      setError(normalizedError);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(undefined);
  }, []);

  return { createWallet, loading, error, data, reset };
}
