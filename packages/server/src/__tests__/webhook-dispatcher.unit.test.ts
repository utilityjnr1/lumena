import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookDispatcher } from "../webhook/dispatcher.js";
import { createHmac } from "node:crypto";

describe("WebhookDispatcher Unit Tests", () => {
  const secret = "test-webhook-secret-key";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers, lists, and unregisters webhook configurations", () => {
    const dispatcher = new WebhookDispatcher();
    dispatcher.register({
      id: "wh-1",
      url: "https://example.com/webhook",
      secret,
      events: ["transaction.cosigned"],
    });

    expect(dispatcher.list()).toHaveLength(1);
    expect(dispatcher.get("wh-1")?.url).toBe("https://example.com/webhook");

    const deleted = dispatcher.unregister("wh-1");
    expect(deleted).toBe(true);
    expect(dispatcher.list()).toHaveLength(0);
  });

  it("generates correct HMAC-SHA256 signature", () => {
    const dispatcher = new WebhookDispatcher();
    const payload = JSON.stringify({ hello: "world" });
    const sig = dispatcher.generateSignature(payload, secret);

    const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(sig).toBe(expected);
  });

  it("filters events by webhook subscriptions and supports wildcards", async () => {
    const dispatcher = new WebhookDispatcher({ timeoutMs: 1000, maxRetries: 0 });

    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock;

    dispatcher.register({
      id: "wh-cosign-only",
      url: "https://example.com/cosign",
      secret,
      events: ["transaction.cosigned"],
    });

    dispatcher.register({
      id: "wh-all",
      url: "https://example.com/all",
      secret,
      events: ["*"],
    });

    // Dispatch an event only wh-all listens to
    await dispatcher.dispatch("balance.low", { balance: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/all",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Lumen-Event": "balance.low",
        }),
      }),
    );

    // Dispatch cosigned event -> both should receive
    fetchMock.mockClear();
    await dispatcher.dispatch("transaction.cosigned", { txHash: "1234" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    await dispatcher.dispatch("transaction.fee_bump.submitted", { hash: "fee-bump-hash" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/all",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Lumen-Event": "transaction.fee_bump.submitted",
        }),
      }),
    );
  });

  it("retries failed deliveries up to maxRetries on 500 error", async () => {
    const dispatcher = new WebhookDispatcher({
      timeoutMs: 500,
      maxRetries: 2,
      initialDelayMs: 10,
      backoffFactor: 1.5,
    });

    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response("OK", { status: 200 });
    });

    dispatcher.register({
      id: "wh-retry",
      url: "https://example.com/retry",
      secret,
      events: ["transaction.sponsored"],
    });

    const results = await dispatcher.dispatch("transaction.sponsored", { hash: "abc" });
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("does not retry on 4xx client errors (e.g. 400 Bad Request)", async () => {
    const dispatcher = new WebhookDispatcher({
      timeoutMs: 500,
      maxRetries: 3,
      initialDelayMs: 10,
    });

    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      calls++;
      return new Response("Bad Request", { status: 400 });
    });

    dispatcher.register({
      id: "wh-400",
      url: "https://example.com/400",
      secret,
      events: ["*"],
    });

    const results = await dispatcher.dispatch("transaction.sponsored", { hash: "abc" });
    expect(results[0].success).toBe(false);
    expect(results[0].attempts).toBe(1);
    expect(calls).toBe(1);
  });
});
