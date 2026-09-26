import { useCallback, useState } from "react";
import type { ContractSimulationResult, ScValInput } from "@lumen/types";
import { useLumen } from "./context.js";

export interface SimulateContractParams {
  walletId: string;
  contractId: string;
  method: string;
  args?: ScValInput[];
}

export function useSimulateContract() {
  const { client } = useLumen();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<ContractSimulationResult>();

  const simulate = useCallback(
    async ({ walletId, contractId, method, args }: SimulateContractParams) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.simulateContract(walletId, contractId, method, args);
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

  return { simulate, loading, error, data };
}
