/**
 * Caches Stellar account sequence numbers per account so that high-throughput
 * flows can avoid a Horizon `loadAccount()` round-trip for every transaction.
 *
 * The cache stores the last known sequence number and increments it locally
 * after each transaction submission. Entries expire after `ttlMs` so that
 * stale values are eventually refreshed from Horizon.
 */
export interface SequenceNumberCacheOpts {
  /** Time-to-live for a cached entry, in milliseconds. Defaults to 30_000. */
  ttlMs?: number;
}

interface CacheEntry {
  sequence: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000;

export class SequenceNumberCache {
  private readonly ttlMs: number;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(opts: SequenceNumberCacheOpts = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Returns the cached sequence number for an account, or `null` when there is
   * no entry or the entry has expired.
   */
  get(accountId: string): string | null {
    const entry = this.entries.get(accountId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(accountId);
      return null;
    }
    return entry.sequence;
  }

  /**
   * Stores the sequence number for an account, refreshing the TTL.
   */
  set(accountId: string, sequence: string): void {
    this.entries.set(accountId, {
      sequence,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Increments the cached sequence number for an account by one, as happens
   * after a transaction is submitted. Returns the new sequence number, or
   * `null` when there is no live entry to increment.
   */
  increment(accountId: string): string | null {
    const current = this.get(accountId);
    if (current === null) return null;
    const next = (BigInt(current) + 1n).toString();
    this.set(accountId, next);
    return next;
  }

  /** Removes the cached entry for an account. */
  invalidate(accountId: string): void {
    this.entries.delete(accountId);
  }

  /** Clears all cached entries. */
  clear(): void {
    this.entries.clear();
  }
}
