import { useCallback, useState } from "react";
import type { ScValInput } from "@lumen/types";
import { useLumen } from "./context.js";

export interface InvokeContractParams {
  walletId: string;
  contractId: string;
  method: string;
  args?: ScValInput[];
  fee?: string;
}

export interface InvokeContractResult {
  hash: string;
}

export interface UseInvokeContractResult {
  invoke: (params: InvokeContractParams) => Promise<InvokeContractResult>;
  loading: boolean;
  error: Error | null;
  data: InvokeContractResult | undefined;
  reset: () => void;
}

export function useInvokeContract(): UseInvokeContractResult {
  const { client } = useLumen();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<InvokeContractResult>();

  const invoke = useCallback(
    async ({ walletId, contractId, method, args, fee }: InvokeContractParams) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.invokeContract(walletId, contractId, method, args, fee);
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

  return { invoke, loading, error, data, reset };
}
