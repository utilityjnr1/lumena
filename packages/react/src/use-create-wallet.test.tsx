import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LumenClient } from "@lumen/web-sdk";
import { LumenProvider } from "./context.js";
import { useCreateWallet } from "./use-create-wallet.js";

describe("useCreateWallet", () => {
  function wrapperFor(client: Pick<LumenClient, "createWallet">) {
    return ({ children }: { children: React.ReactNode }) => (
      <LumenProvider client={client as LumenClient}>{children}</LumenProvider>
    );
  }

  it("creates a wallet and stores the result", async () => {
    const createdWallet = { address: "GADDRESS", id: "GADDRESS" };
    const createWallet = vi.fn().mockResolvedValue(createdWallet);
    const { result } = renderHook(() => useCreateWallet(), {
      wrapper: wrapperFor({ createWallet }),
    });

    let response: typeof createdWallet | undefined;
    await act(async () => {
      response = await result.current.createWallet();
    });

    expect(response).toEqual(createdWallet);
    expect(result.current.data).toEqual(createdWallet);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(createWallet).toHaveBeenCalledOnce();
  });

  it("exposes creation errors and rethrows them", async () => {
    const createWallet = vi.fn().mockRejectedValue(new Error("Creation failed"));
    const { result } = renderHook(() => useCreateWallet(), {
      wrapper: wrapperFor({ createWallet }),
    });

    await act(async () => {
      await expect(result.current.createWallet()).rejects.toThrow("Creation failed");
    });

    expect(result.current.error?.message).toBe("Creation failed");
    expect(result.current.loading).toBe(false);
  });

  it("resets its state", async () => {
    const createWallet = vi.fn().mockResolvedValue({ address: "GADDRESS", id: "GADDRESS" });
    const { result } = renderHook(() => useCreateWallet(), {
      wrapper: wrapperFor({ createWallet }),
    });

    await act(async () => {
      await result.current.createWallet();
    });
    act(() => result.current.reset());

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
