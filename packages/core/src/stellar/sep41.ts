import {
  Address,
  nativeToScVal,
  scValToNative,
  Operation,
  xdr,
} from "@stellar/stellar-sdk";
import type { StellarClient } from "./client.js";

export class Sep41Token {
  readonly contractId: string;
  readonly client?: StellarClient;

  constructor(contractId: string, client?: StellarClient);
  constructor(client: StellarClient, contractId: string);
  constructor(arg1: string | StellarClient, arg2?: string | StellarClient) {
    if (typeof arg1 === "string") {
      this.contractId = arg1;
      this.client = arg2 as StellarClient | undefined;
    } else {
      this.client = arg1;
      this.contractId = arg2 as string;
    }
  }

  /**
   * Builds an invocation operation for checking an account's token balance.
   */
  buildBalanceOperation(address: string): xdr.Operation {
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: "balance",
      args: [new Address(address).toScVal()],
    });
  }

  /**
   * Queries balance of an address by calling/simulating the balance method on Soroban RPC.
   */
  async balance(address: string): Promise<bigint> {
    if (!this.client) {
      throw new Error("StellarClient instance required for balance RPC call");
    }

    const op = this.buildBalanceOperation(address);
    const simResult = await this.client.rpc.simulateTransaction({
      operations: [op],
    } as any);

    return Sep41Token.parseBalanceResponse(simResult);
  }

  /**
   * Parses the return value from a balance contract call simulation or execution into a bigint.
   */
  static parseBalanceResponse(response: any): bigint {
    if (!response) return 0n;

    if (response instanceof xdr.ScVal) {
      const native = scValToNative(response);
      return typeof native === "bigint" ? native : BigInt(native ?? 0);
    }

    if (response.result && response.result.retval) {
      const retval = response.result.retval;
      const native = scValToNative(retval);
      return typeof native === "bigint" ? native : BigInt(native ?? 0);
    }

    if (typeof response === "bigint") return response;
    if (typeof response === "number" || typeof response === "string") return BigInt(response);

    return 0n;
  }

  /**
   * Encodes a SEP-41 `transfer` Soroban operation (from, to, amount).
   */
  transfer(from: string, to: string, amount: string | bigint): xdr.Operation {
    const amountVal = BigInt(amount);
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: "transfer",
      args: [
        new Address(from).toScVal(),
        new Address(to).toScVal(),
        nativeToScVal(amountVal, { type: "i128" }),
      ],
    });
  }

  /**
   * Encodes a SEP-41 `approve` Soroban operation (owner, spender, amount, expirationLedger).
   */
  approve(
    owner: string,
    spender: string,
    amount: string | bigint,
    expirationLedger: number
  ): xdr.Operation {
    const amountVal = BigInt(amount);
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: "approve",
      args: [
        new Address(owner).toScVal(),
        new Address(spender).toScVal(),
        nativeToScVal(amountVal, { type: "i128" }),
        nativeToScVal(expirationLedger, { type: "u32" }),
      ],
    });
  }

  allowance(owner: string, spender: string): xdr.Operation {
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: "allowance",
      args: [new Address(owner).toScVal(), new Address(spender).toScVal()],
    });
  }

  transferFrom(spender: string, from: string, to: string, amount: string | bigint): xdr.Operation {
    return Operation.invokeContractFunction({
      contract: this.contractId,
      function: "transfer_from",
      args: [
        new Address(spender).toScVal(),
        new Address(from).toScVal(),
        new Address(to).toScVal(),
        nativeToScVal(BigInt(amount), { type: "i128" }),
      ],
    });
  }
}
