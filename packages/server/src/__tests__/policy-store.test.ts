import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { InMemoryPolicyStore, RedisPolicyStore, FilePolicyStore } from "../policy/store.js";
import type { Policy } from "@lumen/types";

describe("InMemoryPolicyStore", () => {
  it("saves, retrieves, and deletes policies", async () => {
    const store = new InMemoryPolicyStore();
    const policy: Policy = {
      id: "p1",
      walletId: "w1",
      rules: [],
      createdAt: new Date(),
    };

    await store.savePolicy(policy);
    const retrieved = await store.getPolicy("w1");
    expect(retrieved).toEqual(policy);

    await store.deletePolicy("w1");
    const afterDelete = await store.getPolicy("w1");
    expect(afterDelete).toBeNull();
  });

  it("tracks daily spend per wallet and asset", async () => {
    const store = new InMemoryPolicyStore();
    const res1 = await store.recordSpend("w1", "2026-09-11", 50, "native");
    expect(res1).toEqual({ dailyTotal: 50, txCount: 1 });

    const res2 = await store.recordSpend("w1", "2026-09-11", 30, "native");
    expect(res2).toEqual({ dailyTotal: 80, txCount: 2 });

    const resUsdc = await store.recordSpend("w1", "2026-09-11", 100, "USDC:G123");
    expect(resUsdc).toEqual({ dailyTotal: 100, txCount: 1 });
  });

  it("tracks velocity within sliding time window", async () => {
    const store = new InMemoryPolicyStore();
    const now = Date.now();
    const count1 = await store.recordVelocity("w1", now, 60000);
    expect(count1).toBe(1);

    const count2 = await store.recordVelocity("w1", now + 1000, 60000);
    expect(count2).toBe(2);

    const count3 = await store.recordVelocity("w1", now + 70000, 60000);
    expect(count3).toBe(1);
  });
});

describe("RedisPolicyStore", () => {
  it("interacts with Redis client correctly", async () => {
    const mockRedis = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ id: "p1", walletId: "w1", rules: [] })),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      incrbyfloat: vi.fn().mockResolvedValue("150.5"),
      incr: vi.fn().mockResolvedValue(2),
      expire: vi.fn().mockResolvedValue(1),
      zadd: vi.fn().mockResolvedValue(1),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zcard: vi.fn().mockResolvedValue(3),
    };

    const store = new RedisPolicyStore(mockRedis as any);

    const policy = await store.getPolicy("w1");
    expect(policy?.walletId).toBe("w1");
    expect(mockRedis.get).toHaveBeenCalledWith("lumen:policy:w1");

    const spendRes = await store.recordSpend("w1", "2026-09-11", 50, "native");
    expect(spendRes).toEqual({ dailyTotal: 150.5, txCount: 2 });

    const velRes = await store.recordVelocity("w1", Date.now(), 60000);
    expect(velRes).toBe(3);
  });
});

describe("FilePolicyStore", () => {
  it("persists policies across store instances using a local JSON file", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-policy-test-"));
    const filePath = path.join(tmpDir, "policies.json");

    try {
      const store1 = new FilePolicyStore(filePath);
      const policy: Policy = {
        id: "p1",
        walletId: "w1",
        rules: [{ type: "max_operations", maxOperations: 3 }],
        createdAt: new Date(),
      };

      await store1.savePolicy(policy);
      const retrieved1 = await store1.getPolicy("w1");
      expect(retrieved1).toEqual(policy);

      // Verify file was written and is valid JSON
      expect(fs.existsSync(filePath)).toBe(true);

      // Create a second store instance pointing to same file
      const store2 = new FilePolicyStore(filePath);
      const retrieved2 = await store2.getPolicy("w1");
      expect(retrieved2).toBeDefined();
      expect(retrieved2?.id).toBe("p1");
      expect(retrieved2?.walletId).toBe("w1");
      expect(retrieved2?.rules).toEqual(policy.rules);
      expect(retrieved2?.createdAt.getTime()).toBe(policy.createdAt.getTime());

      // Test deletePolicy persists deletion
      await store2.deletePolicy("w1");
      expect(await store2.getPolicy("w1")).toBeNull();

      // Third store instance confirms deletion was persisted
      const store3 = new FilePolicyStore(filePath);
      expect(await store3.getPolicy("w1")).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles recordSpend and recordVelocity in-memory tracking", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-policy-test-"));
    const filePath = path.join(tmpDir, "policies.json");

    try {
      const store = new FilePolicyStore(filePath);
      const res = await store.recordSpend("w1", "2026-09-25", 25, "native");
      expect(res).toEqual({ dailyTotal: 25, txCount: 1 });

      const vel = await store.recordVelocity("w1", Date.now(), 60000);
      expect(vel).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
