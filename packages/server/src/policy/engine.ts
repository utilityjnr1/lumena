import type { Transaction, Operation, Asset } from "@stellar/stellar-sdk";
import type {
  Policy,
  PolicyRule,
  SpendLimit,
  VelocityRule,
  AllowlistRule,
  SessionKeyPolicyRule,
  TimeBoundsRule,
  RequireMemoRule,
} from "@lumen/types";
import { validateTimeBounds } from "@lumen/core";

export interface EvaluateOpts {
  walletAddress: string;
  transaction: Transaction;
}

export interface EvaluateResult {
  approved: boolean;
  reason?: string;
}

export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();

  // In-memory tracking for spend limit and velocity
  private readonly spendTracking: Map<
    string,
    Map<string, { dailyTotal: number; txCount: number }>
  > = new Map();
  private readonly velocityTracking: Map<string, number[]> = new Map();
  private readonly sessionSpendTracking: Map<string, number> = new Map();

  addPolicy(policy: Policy): void {
    this.policies.set(policy.walletId, policy);
  }

  removePolicy(walletId: string): void {
    this.policies.delete(walletId);
    this.spendTracking.delete(walletId);
    this.velocityTracking.delete(walletId);
  }

  getPolicy(walletId: string): Policy | null {
    return this.policies.get(walletId) ?? null;
  }

  evaluate(opts: EvaluateOpts): EvaluateResult {
    const policy = this.policies.get(opts.walletAddress);

    if (!policy) {
      return { approved: true };
    }

    for (const rule of policy.rules) {
      const result = this.evaluateRule(rule, opts);
      if (!result.approved) {
        return result;
      }
    }

    return { approved: true };
  }

  private evaluateRule(rule: PolicyRule, opts: EvaluateOpts): EvaluateResult {
    switch (rule.type) {
      case "spend_limit":
        return this.evaluateSpendLimit(rule as SpendLimit, opts);
      case "velocity":
        return this.evaluateVelocity(rule as VelocityRule, opts);
      case "allowlist":
        return this.evaluateAllowlist(rule as AllowlistRule, opts);
      case "session_key":
        return this.evaluateSessionKey(rule as SessionKeyPolicyRule, opts);
      case "timebounds":
        return this.evaluateTimeBounds(rule as TimeBoundsRule, opts);
      case "require_memo":
        return this.evaluateRequireMemo(rule as RequireMemoRule, opts);
      default:
        return { approved: true };
    }
  }

  private evaluateSpendLimit(rule: SpendLimit, opts: EvaluateOpts): EvaluateResult {
    const { walletAddress } = opts;
    const targetAsset = this.getAssetIdentifier(rule.asset);

    let txAmount = 0;
    let matchedOps = 0;

    for (const op of opts.transaction.operations) {
      // Type guard: only operations that carry an `amount` field (Payment, PathPayment, etc.)
      if (!("amount" in op) || typeof (op as { amount: unknown }).amount !== "string") {
        continue;
      }

      const typedOp = op as
        Operation.Payment | Operation.PathPaymentStrictSend | Operation.PathPaymentStrictReceive;
      const opAsset: Asset | undefined =
        "asset" in typedOp ? (typedOp as Operation.Payment).asset : undefined;
      const opAssetId = this.getAssetIdentifier(opAsset);

      if (opAssetId === targetAsset) {
        txAmount += parseFloat((typedOp as { amount: string }).amount);
        matchedOps++;
      }
    }

    if (matchedOps === 0) {
      return { approved: true };
    }

    if (!this.spendTracking.has(walletAddress)) {
      this.spendTracking.set(walletAddress, new Map());
    }
    const walletTrack = this.spendTracking.get(walletAddress)!;
    const today = new Date().toISOString().split("T")[0];
    const trackKey = `${today}:${targetAsset}`;

    if (!walletTrack.has(trackKey)) {
      walletTrack.set(trackKey, { dailyTotal: 0, txCount: 0 });
    }
    const track = walletTrack.get(trackKey)!;

    if (track.dailyTotal + txAmount > parseFloat(rule.maxDaily)) {
      return {
        approved: false,
        reason: `Daily spending ${track.dailyTotal + txAmount} exceeds limit ${rule.maxDaily}`,
      };
    }

    track.dailyTotal += txAmount;
    track.txCount++;

    return { approved: true };
  }

  private getAssetIdentifier(asset: Asset | string | undefined | null): string {
    if (!asset) return "native";
    if (typeof asset === "string") {
      if (asset.toLowerCase() === "native" || asset.toUpperCase() === "XLM") {
        return "native";
      }
      return asset;
    }
    if (asset.isNative()) {
      return "native";
    }
    if (asset.code && asset.issuer) {
      return `${asset.code}:${asset.issuer}`;
    }
    if (asset.code) {
      return asset.code;
    }
    return "native";
  }

  private evaluateVelocity(rule: VelocityRule, opts: EvaluateOpts): EvaluateResult {
    const { walletAddress } = opts;

    // Initialize tracking for this wallet if needed
    if (!this.velocityTracking.has(walletAddress)) {
      this.velocityTracking.set(walletAddress, []);
    }
    const txTimes = this.velocityTracking.get(walletAddress)!;

    // Remove timestamps outside the window
    const windowMs = rule.windowMinutes * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const recentTxs = txTimes.filter((t) => t > cutoff);

    // Add current transaction timestamp
    recentTxs.push(Date.now());

    // Update tracking
    this.velocityTracking.set(walletAddress, recentTxs);

    // Check if exceeding limit
    if (recentTxs.length > rule.maxTransactions) {
      return {
        approved: false,
        reason: `Too many transactions (${recentTxs.length}) in ${rule.windowMinutes}-minute window (max: ${rule.maxTransactions})`,
      };
    }

    return { approved: true };
  }

  private evaluateAllowlist(rule: AllowlistRule, opts: EvaluateOpts): EvaluateResult {
    for (const op of opts.transaction.operations) {
      if ("destination" in op && op.destination) {
        const destination = op.destination.toString();
        if (!rule.destinations.includes(destination)) {
          return {
            approved: false,
            reason: `Destination ${destination} is not on the allowlist`,
          };
        }
      }
    }

    return { approved: true };
  }

  private evaluateSessionKey(rule: SessionKeyPolicyRule, opts: EvaluateOpts): EvaluateResult {
    const now = Date.now();
    const expiryMs = rule.expiresAt < 1e11 ? rule.expiresAt * 1000 : rule.expiresAt;

    if (now > expiryMs) {
      return { approved: false, reason: `Session key ${rule.sessionPublicKey} has expired` };
    }

    const paymentOp = opts.transaction.operations.find(
      (op): op is Operation.Payment => "amount" in op && "destination" in op,
    ) as Operation.Payment | undefined;

    const txAmount = paymentOp ? parseFloat(paymentOp.amount) : 0;
    const currentSpend = this.sessionSpendTracking.get(rule.sessionPublicKey) ?? 0;
    const maxSpend = parseFloat(rule.maxSpend);

    if (currentSpend + txAmount > maxSpend) {
      return {
        approved: false,
        reason: `Session key spend cap exceeded (${currentSpend + txAmount} > ${maxSpend})`,
      };
    }

    this.sessionSpendTracking.set(rule.sessionPublicKey, currentSpend + txAmount);
    return { approved: true };
  }

  private evaluateTimeBounds(rule: TimeBoundsRule, opts: EvaluateOpts): EvaluateResult {
    const result = validateTimeBounds(opts.transaction, {
      maxWindowSeconds: rule.maxWindowSeconds,
      allowUnbounded: rule.allowUnbounded ?? false,
    });

    if (!result.valid) {
      return { approved: false, reason: result.reason };
    }

    return { approved: true };
  }

  private evaluateRequireMemo(rule: RequireMemoRule, opts: EvaluateOpts): EvaluateResult {
    if (!opts.transaction.memo || opts.transaction.memo.type === "none") {
      const requiresMemo = opts.transaction.operations.some((op) => {
        if (!("destination" in op) || !op.destination) return false;
        return !rule.destinations || rule.destinations.includes(op.destination.toString());
      });
      if (requiresMemo) {
        return { approved: false, reason: "Transaction memo is required for this destination" };
      }
    }
    return { approved: true };
  }
}
