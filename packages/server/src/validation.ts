import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const CosignRequestSchema = z.object({
  xdr: z.string().min(1, "xdr is required"),
  walletAddress: z.string().refine((val) => StrKey.isValidEd25519PublicKey(val), {
    message: "walletAddress must be a valid Stellar public key",
  }),
  ip: z.string().min(1, "ip must not be empty").optional(),
  country: z.string().min(1, "country must not be empty").optional(),
});

export const CosignBatchRequestSchema = z.object({
  transactions: z
    .array(CosignRequestSchema)
    .min(1, "At least one transaction is required")
    .max(50, "A batch may contain at most 50 transactions"),
});

export const CosignAuthEntryRequestSchema = z.object({
  entryXdr: z.string().min(1, "entryXdr is required"),
  walletAddress: z.string().refine((val) => StrKey.isValidEd25519PublicKey(val), {
    message: "walletAddress must be a valid Stellar public key",
  }),
  validUntilLedgerSeq: z.number().int().positive("validUntilLedgerSeq must be a positive integer"),
});

export const FeeBumpRequestSchema = z.object({
  xdr: z.string().min(1, "xdr is required"),
});

const SpendLimitSchema = z.object({
  type: z.literal("spend_limit"),
  asset: z.string().min(1, "asset is required"),
  maxPerTx: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/, "maxPerTx must be a decimal string"),
  maxDaily: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/, "maxDaily must be a decimal string"),
});

const VelocityRuleSchema = z.object({
  type: z.literal("velocity"),
  maxTransactions: z.number().int().positive("maxTransactions must be a positive integer"),
  windowMinutes: z.number().int().positive("windowMinutes must be a positive integer"),
});

const AllowlistRuleSchema = z.object({
  type: z.literal("allowlist"),
  destinations: z
    .array(z.string().startsWith("G", "destination must be a valid Stellar public key"))
    .min(1, "At least one destination is required"),
});

const BlocklistRuleSchema = z.object({
  type: z.literal("blocklist"),
  destinations: z
    .array(z.string().startsWith("G", "destination must be a valid Stellar public key"))
    .min(1, "At least one destination is required"),
});

const AssetAllowlistRuleSchema = z.object({
  type: z.literal("asset_allowlist"),
  assets: z
    .array(z.string().min(1, "asset must not be empty"))
    .min(1, "At least one asset is required"),
});

const MaxOperationsRuleSchema = z.object({
  type: z.literal("max_operations"),
  maxOperations: z.number().int().positive("maxOperations must be a positive integer"),
});

const FeeLimitRuleSchema = z.object({
  type: z.literal("fee_limit"),
  maxFeeStroops: z.number().int().positive("maxFeeStroops must be a positive integer"),
});

const ContractAllowlistRuleSchema = z.object({
  type: z.literal("contract_allowlist"),
  allowedContracts: z
    .array(
      z.object({
        contractId: z.string().min(1, "contractId is required"),
        methods: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1, "At least one contract must be specified"),
});

const PolicyRuleSchema = z.discriminatedUnion("type", [
  SpendLimitSchema,
  VelocityRuleSchema,
  AllowlistRuleSchema,
  BlocklistRuleSchema,
  AssetAllowlistRuleSchema,
  MaxOperationsRuleSchema,
  FeeLimitRuleSchema,
  ContractAllowlistRuleSchema,
]);

export const PolicyRequestSchema = z.object({
  walletId: z.string().regex(/^G[A-Z2-7]{55}$/, "walletId must be a valid Stellar public key"),
  rules: z.array(PolicyRuleSchema).min(1, "At least one rule is required"),
});

export type CosignRequest = z.infer<typeof CosignRequestSchema>;
export type CosignBatchRequest = z.infer<typeof CosignBatchRequestSchema>;
export type CosignAuthEntryRequest = z.infer<typeof CosignAuthEntryRequestSchema>;
export type FeeBumpRequest = z.infer<typeof FeeBumpRequestSchema>;
export type PolicyRequest = z.infer<typeof PolicyRequestSchema>;

export const WebhookRequestSchema = z.object({
  id: z.string().optional(),
  url: z.string().url("url must be a valid URL"),
  secret: z.string().min(1, "secret is required"),
  events: z.array(z.string().min(1)).min(1, "at least one event is required"),
  enabled: z.boolean().optional(),
});

export type WebhookRequest = z.infer<typeof WebhookRequestSchema>;

/**
 * Schema for PATCH /webhooks/:id — all fields are optional.
 * At least one field must be present.
 */
export const WebhookPatchSchema = z
  .object({
    url: z.string().url("url must be a valid URL").optional(),
    events: z.array(z.string().min(1)).min(1, "at least one event is required").optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (url, events, or enabled) must be provided",
  });

export type WebhookPatch = z.infer<typeof WebhookPatchSchema>;

/**
 * Maximum serialized size (in bytes) of a wallet's `metadata` object.
 */
export const WALLET_METADATA_MAX_BYTES = 4096;

/**
 * Schema for PATCH /wallets/:address — all fields are optional.
 * At least one field must be present.
 */
export const WalletPatchSchema = z
  .object({
    label: z
      .string()
      .max(128, "label must be at most 128 characters")
      .optional(),
    tags: z
      .array(
        z
          .string()
          .min(1, "tag must not be empty")
          .max(64, "tag must be at most 64 characters")
          .regex(
            /^[a-zA-Z0-9._:-]+$/,
            "tag may only contain letters, digits, '.', '_', ':' and '-'",
          ),
      )
      .max(20, "at most 20 tags are allowed")
      .optional(),
    metadata: z
      .record(z.string(), z.unknown())
      .refine(
        (val) => Buffer.byteLength(JSON.stringify(val), "utf8") <= WALLET_METADATA_MAX_BYTES,
        {
          message: `metadata must be at most ${WALLET_METADATA_MAX_BYTES} bytes when serialized`,
        },
      )
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (label, tags, or metadata) must be provided",
  });

export type WalletPatch = z.infer<typeof WalletPatchSchema>;

/**
 * Schema for POST /wallets/:address/close — account that receives the
 * remaining funds of the merged wallet.
 */
export const WalletCloseSchema = z.object({
  destination: z.string().refine((val) => StrKey.isValidEd25519PublicKey(val), {
    message: "destination must be a valid Stellar public key",
  }),
});

export type WalletClose = z.infer<typeof WalletCloseSchema>;

/**
 * Schema for GET /wallets — optional tag filter.
 */
export const WalletListQuerySchema = z.object({
  tag: z.string().min(1, "tag must not be empty").optional(),
});

export type WalletListQuery = z.infer<typeof WalletListQuerySchema>;

/**
 * Schema for GET /auth/challenge?account=<publicKey> — SEP-10 challenge request.
 */
export const Sep10ChallengeQuerySchema = z.object({
  account: z.string().refine((val) => StrKey.isValidEd25519PublicKey(val), {
    message: "account must be a valid Stellar public key",
  }),
});

export type Sep10ChallengeQuery = z.infer<typeof Sep10ChallengeQuerySchema>;

/**
 * Schema for POST /auth/token — SEP-10 signed challenge submission.
 */
export const Sep10TokenRequestSchema = z.object({
  transaction: z.string().min(1, "transaction is required"),
});

export type Sep10TokenRequest = z.infer<typeof Sep10TokenRequestSchema>;

/**
 * Schema for POST /webhooks/deliveries/:id/retry — delivery id path param.
 */
export const WebhookDeliveryRetryParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export type WebhookDeliveryRetryParams = z.infer<typeof WebhookDeliveryRetryParamsSchema>;

/**
 * Log levels accepted by the server. Kept in sync with the logger's level set.
 */
export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Rate limit configuration (requests per window, in milliseconds).
 */
export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

/**
 * Express `trust proxy` setting. Either a hop count (number of trusted
 * reverse-proxy hops in front of the server) or an explicit list of trusted
 * proxy CIDR ranges / addresses. `false` means proxy headers are ignored and
 * the socket peer address is used (safe default).
 */
export type TrustProxyConfig = false | number | string[];

/**
 * Fully resolved server configuration.
 */
export interface ServerConfig {
  corsOrigins: string[];
  logLevel: LogLevel;
  rateLimits: RateLimitConfig;
  trustProxy: TrustProxyConfig;
  apiKey?: string;
  credentialsEnabled: boolean;
}

/**
 * The subset of configuration that can be changed at runtime via SIGHUP.
 */
export interface ReloadableConfig {
  corsOrigins: string[];
  logLevel: LogLevel;
  rateLimits: RateLimitConfig;
}

export type ConfigResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DEFAULT_LOG_LEVEL: LogLevel = "info";
const DEFAULT_RATE_LIMIT: RateLimitConfig = { windowMs: 60_000, max: 100 };

/**
 * Normalise a single CORS origin entry to `scheme://host[:port]`.
 * Returns an error string when the entry is malformed or contains a path,
 * query, fragment, or credentials.
 */
export function normaliseOrigin(raw: string): ConfigResult<string> {
  const entry = raw.trim();
  if (entry.length === 0) {
    return { ok: false, error: "empty origin entry" };
  }

  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return { ok: false, error: `malformed origin: "${entry}"` };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `origin must use http or https: "${entry}"` };
  }
  if (url.username || url.password) {
    return { ok: false, error: `origin must not contain credentials: "${entry}"` };
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return { ok: false, error: `origin must not contain a path: "${entry}"` };
  }
  if (url.search || url.hash) {
    return { ok: false, error: `origin must not contain a query or fragment: "${entry}"` };
  }

  return { ok: true, value: url.origin };
}

/**
 * Parse the comma-separated `CORS_ORIGINS` value into a normalised list.
 * A single `*` entry is preserved as-is (wildcard) and must be validated
 * against credentials separately.
 */
export function parseCorsOrigins(raw: string | undefined): ConfigResult<string[]> {
  if (raw === undefined || raw.trim() === "") {
    return { ok: true, value: [] };
  }

  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    return { ok: true, value: [] };
  }

  const origins: string[] = [];
  for (const part of parts) {
    if (part === "*") {
      origins.push("*");
      continue;
    }
    const result = normaliseOrigin(part);
    if (!result.ok) {
      return result;
    }
    origins.push(result.value);
  }

  return { ok: true, value: origins };
}

function parsePositiveInt(raw: string | undefined, fallback: number): ConfigResult<number> {
  if (raw === undefined || raw.trim() === "") {
    return { ok: true, value: fallback };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, error: `expected a positive integer, got "${raw}"` };
  }
  return { ok: true, value: parsed };
}

function parseLogLevel(raw: string | undefined): ConfigResult<LogLevel> {
  if (raw === undefined || raw.trim() === "") {
    return { ok: true, value: DEFAULT_LOG_LEVEL };
  }
  const level = raw.trim().toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    return { ok: false, error: `invalid log level: "${raw}"` };
  }
  return { ok: true, value: level as LogLevel };
}

const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/;
const IPV6_CIDR = /^[0-9a-fA-F:]+(?:\/(\d{1,3}))?$/;

function isValidIpOrCidr(entry: string): boolean {
  const ipv4 = IPV4_CIDR.exec(entry);
  if (ipv4) {
    const octets = ipv4.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) {
      return false;
    }
    const prefix = ipv4[5] === undefined ? 32 : Number(ipv4[5]);
    return prefix >= 0 && prefix <= 32;
  }
  const ipv6 = IPV6_CIDR.exec(entry);
  if (ipv6) {
    if (!entry.includes(":")) {
      return false;
    }
    const prefix = ipv6[1] === undefined ? 128 : Number(ipv6[1]);
    return prefix >= 0 && prefix <= 128;
  }
  return false;
}

/**
 * Parse `TRUST_PROXY` into an Express `trust proxy` value.
 *
 *   unset / "false" / "0"  → false (ignore X-Forwarded-For; safe default)
 *   "true"                 → rejected: trusting every hop lets any client spoof
 *                            its IP and bypass rate limiting
 *   positive integer N     → trust the N closest proxy hops
 *   comma-separated CIDRs  → trust only those proxy addresses/ranges
 */
export function parseTrustProxy(raw: string | undefined): ConfigResult<TrustProxyConfig> {
  if (raw === undefined || raw.trim() === "") {
    return { ok: true, value: false };
  }

  const value = raw.trim();
  const lower = value.toLowerCase();
  if (lower === "false" || lower === "0") {
    return { ok: true, value: false };
  }
  if (lower === "true") {
    return {
      ok: false,
      error:
        'TRUST_PROXY="true" is unsafe: it trusts any client-supplied X-Forwarded-For. ' +
        "Use a hop count (e.g. 1) or a comma-separated CIDR list instead",
    };
  }

  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops <= 0) {
      return { ok: true, value: false };
    }
    return { ok: true, value: hops };
  }

  const entries = value
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  if (entries.length === 0) {
    return { ok: true, value: false };
  }
  for (const entry of entries) {
    if (!isValidIpOrCidr(entry)) {
      return { ok: false, error: `invalid proxy address or CIDR: "${entry}"` };
    }
  }
  return { ok: true, value: entries };
}

function parseRateLimits(env: NodeJS.ProcessEnv): ConfigResult<RateLimitConfig> {
  const windowMs = parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT.windowMs);
  if (!windowMs.ok) {
    return { ok: false, error: `RATE_LIMIT_WINDOW_MS: ${windowMs.error}` };
  }
  const max = parsePositiveInt(env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT.max);
  if (!max.ok) {
    return { ok: false, error: `RATE_LIMIT_MAX: ${max.error}` };
  }
  return { ok: true, value: { windowMs: windowMs.value, max: max.value } };
}

/**
 * Validate a resolved configuration, throwing on unsafe combinations.
 */
export function validateConfig(cfg: ServerConfig): void {
  if (cfg.corsOrigins.includes("*")) {
    if (cfg.corsOrigins.length > 1) {
      throw new Error("CORS_ORIGINS: wildcard '*' cannot be combined with explicit origins");
    }
    if (cfg.credentialsEnabled || (cfg.apiKey !== undefined && cfg.apiKey.length > 0)) {
      throw new Error(
        "CORS_ORIGINS: wildcard '*' is not allowed when credentials or API keys are enabled",
      );
    }
  }

  if (!(LOG_LEVELS as readonly string[]).includes(cfg.logLevel)) {
    throw new Error(`invalid log level: "${cfg.logLevel}"`);
  }

  if (!Number.isInteger(cfg.rateLimits.windowMs) || cfg.rateLimits.windowMs <= 0) {
    throw new Error("rateLimits.windowMs must be a positive integer");
  }
  if (!Number.isInteger(cfg.rateLimits.max) || cfg.rateLimits.max <= 0) {
    throw new Error("rateLimits.max must be a positive integer");
  }
}

/**
 * Load and validate configuration from the environment.
 * Throws on invalid or unsafe configuration so the process can fail fast.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  if (!corsOrigins.ok) {
    throw new Error(`CORS_ORIGINS: ${corsOrigins.error}`);
  }

  const logLevel = parseLogLevel(env.LOG_LEVEL);
  if (!logLevel.ok) {
    throw new Error(logLevel.error);
  }

  const rateLimits = parseRateLimits(env);
  if (!rateLimits.ok) {
    throw new Error(rateLimits.error);
  }

  const apiKey = env.API_KEY && env.API_KEY.length > 0 ? env.API_KEY : undefined;
  const credentialsEnabled = env.CREDENTIALS_ENABLED === "true";

  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  if (!trustProxy.ok) {
    throw new Error(`TRUST_PROXY: ${trustProxy.error}`);
  }

  const cfg: ServerConfig = {
    corsOrigins: corsOrigins.value,
    logLevel: logLevel.value,
    rateLimits: rateLimits.value,
    trustProxy: trustProxy.value,
    apiKey,
    credentialsEnabled,
  };

  validateConfig(cfg);
  return cfg;
}

/**
 * Re-read the environment and return the reloadable subset of configuration.
 * On any validation error the caller should retain the previous values.
 */
export function reloadConfig(env: NodeJS.ProcessEnv = process.env): ConfigResult<ReloadableConfig> {
  try {
    const cfg = loadConfig(env);
    return {
      ok: true,
      value: {
        corsOrigins: cfg.corsOrigins,
        logLevel: cfg.logLevel,
        rateLimits: cfg.rateLimits,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
