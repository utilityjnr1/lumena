import client from "prom-client";

export const register = new client.Registry();

client.collectDefaultMetrics({ register, prefix: "lumen_" });

export const cosignRequestsTotal = new client.Counter({
  name: "lumen_cosign_requests_total",
  help: "Total number of co-sign requests processed",
  labelNames: ["status"],
  registers: [register],
});

export const feeBumpRequestsTotal = new client.Counter({
  name: "lumen_fee_bump_requests_total",
  help: "Total number of fee-bump requests processed",
  registers: [register],
});

export const sponsorBalanceXlm = new client.Gauge({
  name: "lumen_sponsor_balance_xlm",
  help: "Current balance of fee sponsor account in XLM",
  registers: [register],
});

export const policyEvaluationDurationSeconds = new client.Histogram({
  name: "lumen_policy_evaluation_duration_seconds",
  help: "Duration of policy evaluations in seconds",
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});
