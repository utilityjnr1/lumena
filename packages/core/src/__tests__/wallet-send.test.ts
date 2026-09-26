import { afterEach, describe, expect, it, vi } from "vitest";
import { Asset, Keypair } from "@stellar/stellar-sdk";
import type { StellarClient } from "../stellar/client.js";
import { Wallet } from "../wallet/wallet.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createWallet(serverUrl?: string) {
  const ownerKeypair = Keypair.random();
  const submitTransaction = vi.fn();
  const wallet = new Wallet({
    client: {
      horizon: { submitTransaction },
    } as unknown as StellarClient,
    sponsorKeypair: Keypair.random(),
    serverPublicKey: Keypair.random().publicKey(),
    serverUrl,
    ownerKeypair,
  });
  Object.defineProperty(wallet, "_address", { value: ownerKeypair.publicKey() });
  vi.spyOn(wallet, "buildPaymentTransaction").mockResolvedValue("owner-signed-xdr");
  return { wallet, submitTransaction, ownerKeypair };
}

describe("Wallet.send", () => {
  it("routes signed payments through co-signing and sponsored submission", async () => {
    const { wallet, submitTransaction, ownerKeypair } = createWallet("https://lumen.example/");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signedXdr: "cosigned-xdr" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hash: "fee-bump-hash" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(wallet.send(Keypair.random().publicKey(), Asset.native(), "1")).resolves.toEqual({
      hash: "fee-bump-hash",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://lumen.example/cosign");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      xdr: "owner-signed-xdr",
      walletAddress: ownerKeypair.publicKey(),
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://lumen.example/fee-bump/submit");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      xdr: "cosigned-xdr",
    });
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("does not send payments directly when no Lumen server URL is configured", async () => {
    const { wallet, submitTransaction } = createWallet();

    await expect(wallet.send(Keypair.random().publicKey(), Asset.native(), "1")).rejects.toThrow(
      "A Lumen server URL is required",
    );
    expect(submitTransaction).not.toHaveBeenCalled();
  });
});
