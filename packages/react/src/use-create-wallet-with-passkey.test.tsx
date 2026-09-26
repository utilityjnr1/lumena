import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LumenClient, PasskeyWalletResult } from "@lumen/web-sdk";
import { LumenProvider } from "./context.js";
import { useCreateWalletWithPasskey } from "./use-create-wallet-with-passkey.js";

describe("useCreateWalletWithPasskey", () => {
  const result = {
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    id: "wallet-1",
    credentialId: "credential-1",
    keypair: {},
  } as PasskeyWalletResult;

  function wrapper(client: LumenClient) {
    return ({ children }: { children: React.ReactNode }) => (
      <LumenProvider client={client}>{children}</LumenProvider>
    );
  }

  it("creates a passkey wallet and exposes the result", async () => {
    const createWalletWithPasskey = vi.fn().mockResolvedValue(result);
    const client = { createWalletWithPasskey } as unknown as LumenClient;
    const opts = { username: "alice" };
    const { result: hookResult } = renderHook(() => useCreateWalletWithPasskey(), {
      wrapper: wrapper(client),
    });

    let wallet: PasskeyWalletResult | undefined;
    await act(async () => {
      wallet = await hookResult.current.createWalletWithPasskey(opts);
    });

    expect(createWalletWithPasskey).toHaveBeenCalledWith(opts);
    expect(wallet).toBe(result);
    expect(hookResult.current.data).toBe(result);
    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.error).toBeNull();
  });

  it("normalizes failures and rethrows them", async () => {
    const createWalletWithPasskey = vi.fn().mockRejectedValue("registration failed");
    const client = { createWalletWithPasskey } as unknown as LumenClient;
    const { result: hookResult } = renderHook(() => useCreateWalletWithPasskey(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await expect(hookResult.current.createWalletWithPasskey()).rejects.toThrow(
        "registration failed",
      );
    });

    expect(hookResult.current.error).toEqual(new Error("registration failed"));
    expect(hookResult.current.loading).toBe(false);
  });

  it("resets result and error state", async () => {
    const createWalletWithPasskey = vi.fn().mockResolvedValue(result);
    const client = { createWalletWithPasskey } as unknown as LumenClient;
    const { result: hookResult } = renderHook(() => useCreateWalletWithPasskey(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await hookResult.current.createWalletWithPasskey();
    });
    act(() => hookResult.current.reset());

    expect(hookResult.current.data).toBeUndefined();
    expect(hookResult.current.error).toBeNull();
    expect(hookResult.current.loading).toBe(false);
  });
});
