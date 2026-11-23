import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors, { type CorsOptions } from "cors";
import compression from "compression";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer as createHttpServer,
  type Server as HttpServer,
  type RequestListener,
  type IncomingMessage,
} from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { StellarClient } from "@lumen/core";
import type { Signer } from "@lumen/types";
import type { WalletRegistry } from "@lumen/core";
import type { Redis } from "ioredis";
import { CosignerService } from "./cosigner/service.js";
import { FeeSponsorService } from "./fee-sponsor/service.js";
import { PolicyEngine } from "./policy/engine.js";
import { FailoverStellarClient, type StellarEndpoint } from "./stellar/router.js";
import {
  NetworkRegistry,
  type NetworkConfig,
  type NetworkRegistryOptions,
} from "./stellar/network-registry.js";
import { FraudDetector, type FraudDetectorConfig } from "./security/fraud-detector.js";
import {
  createTokenBucketRateLimiter,
  type BucketConfig,
} from "./middleware/rate-limiter.js";
import { createIdempotencyMiddleware } from "./middleware/idempotency.js";
import { createAntiReplayMiddleware } from "./middleware/anti-replay.js";
import { createRbacMiddleware, parseClaims, ROLE_PERMISSIONS, type RbacConfig } from "./middleware/rbac.js";
import {
  createTenantAuthMiddleware,
  hashApiKey,
  type TenantStore,
} from "./middleware/auth.js";
import { createSep10Router, type Sep10Config } from "./auth/sep10.js";
import type { SequenceAllocator } from "./fee-sponsor/sequence-allocator.js";
import {
  CosignRequestSchema,
  CosignBatchRequestSchema,
  CosignAuthEntryRequestSchema,
  FeeBumpRequestSchema,
  PolicyRequestSchema,
  WebhookRequestSchema,
  WebhookPatchSchema,
  WalletPatchSchema,
  WalletCloseSchema,
} from "./validation.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi.js";
import { ValidationError, PolicyError, errorHandler, wrapHandler } from "./errors.js";
import { logger, httpLogger } from "./logger.js";
import {
  register,
  cosignRequestsTotal,
  feeBumpRequestsTotal,
  policyEvaluationDurationSeconds,
  resolveRouteLabel,
} from "./metrics.js";

import { SponsorMonitorService } from "./fee-sponsor/monitor.js";
import { SponsorRefillService } from "./fee-sponsor/refill.js";
import { SponsorReserveService } from "./fee-sponsor/reserves.js";
import { LedgerIngestionWorker, type LedgerTransactionUpdate } from "./ledger/ingest.js";
import { WebhookDispatcher } from "./webhook/dispatcher.js";
import { createGraphQLGateway } from "./graphql/index.js";
import { createWalletWebSocketServer } from "./websocket/index.js";
import { MerkleAuditLog, parseAuditRecord } from "./audit/merkle-log.js";
import { createAuditExportHandler } from "./audit/export.js";

/** A single policy decision broadcast on the audit stream. */
export interface AuditEvent {
  /** ISO timestamp of when the decision was made. */
  timestamp: string;
  /** Whether the transaction was approved or rejected by policy. */
  decision: "approved" | "rejected";
  /** Wallet address the decision applies to, when known. */
  wallet?: string;
  /** Transaction hash, when known. */
  txHash?: string;
  /** Fee (in stroops) associated with the transaction, when known. */
  fee?: string;
  /** Human-readable reason for the decision (typically on rejections). */
  reason?: string;
}

export interface ServerResult {
  /** Configured Express application. */
  app: Express;
  /** Node HTTP server wrapping the Express application. */
  server: HttpServer;
  /** Stellar/Horizon/RPC client used by server services. */
  client: StellarClient;
  /**
   * #519 — tenant-scoped network registry, when configured. Resolves each
   * tenant/API key to its own Horizon/RPC/passphrase/sponsor configuration.
   */
  networkRegistry?: NetworkRegistry;
  /** Latency-aware failover router, when multiple endpoints are configured. */
  stellarRouter?: FailoverStellarClient;
  /** Real-time anomaly/fraud detector used by the co-signer service. */
  fraudDetector: FraudDetector;
  cosignerService: CosignerService;
  feeSponsorService: FeeSponsorService;
  sponsorMonitorService: SponsorMonitorService;
  ledgerIngestionWorker?: LedgerIngestionWorker;
  policyEngine: PolicyEngine;
  webhookDispatcher: WebhookDispatcher;
  /** WebSocket server backing the real-time audit stream. */
  auditWebSocketServer: WebSocketServer;
  /** Wallet event WebSocket backing the real-time wallet subscription stream. */
  walletWebSocketServer: WebSocketServer;
  /** Broadcasts a policy decision to all connected audit stream clients. */
  broadcastAuditEvent: (event: AuditEvent) => void;
  /** Broadcasts a wallet-scoped event to all subscribers for that wallet. */
  broadcastWalletEvent: (walletAddress: string, event: string, payload?: Record<string, unknown>) => void;
  /** Hash-chained audit decisions and Merkle-root verification. */
  auditLog: MerkleAuditLog;
  /**
   * Re-applies reloadable configuration (log level, rate limits, CORS
   * allowlist) atomically. Invalid values are rejected, logged, and the
   * previous values are retained. Returns whether the reload succeeded.
   */
  reloadConfig: () => Promise<boolean>;
  /**
   * Stops accepting new connections and drains in-flight requests.
   * Resolves once the HTTP server has closed (or the grace period elapses).
   */
  shutdown: (gracePeriodMs?: number) => Promise<void>;
}

export interface ServerOpts {
  /** Port used by the HTTP server. Defaults to 3000. */
  port?: number;
  /** Stellar network preset used for Horizon/RPC defaults. */
  network?: "testnet" | "mainnet" | "local";
  horizonUrl?: string;
  rpcUrl?: string;
  /**
   * Pool of Horizon and Soroban RPC endpoints used by the latency-aware
   * failover router. When more than one endpoint is provided, a
   * FailoverStellarClient is instantiated and used for routing.
   */
  stellarEndpoints?: StellarEndpoint[];
  /**
   * Interval (ms) between background health/latency pings of the router.
   */
  stellarHealthCheckIntervalMs?: number;
  /**
   * Optional fraud detector configuration (velocity/geo-IP thresholds).
   */
  fraudDetectorConfig?: FraudDetectorConfig;
  /**
   * Optional pre-built fraud detector instance.
   */
  fraudDetector?: FraudDetector;
  /**
   * Signer used by the co-signer service.
   * Dev/testnet → EnvSigner.  Production → AwsKmsSigner or equivalent.
   */
  cosignerSigner: Signer;
  /**
   * Signer used by the fee-sponsor service.
   * Dev/testnet → EnvSigner.  Production → AwsKmsSigner or equivalent.
   */
  feePayerSigner: Signer;
  minSponsorBalance?: number;
  sponsorPollIntervalMs?: number;
  /** Transfer XLM from a configured treasury when the sponsor balance is low. */
  sponsorRefillTransfer?: (amountXlm: number) => Promise<void>;
  sponsorTargetBalanceXlm?: number;
  sponsorRefillCooldownMs?: number;
  /** Persist finalized Horizon transaction status and actual charged fee. */
  updateLedgerTransaction?: (update: LedgerTransactionUpdate) => Promise<void>;
  webhookDispatcher?: WebhookDispatcher;
  /**
   * Optional CORS configuration passed to the `cors` npm package.
   * Cross-origin access is disabled by default.
   */
  cors?: CorsOptions;
  /**
   * Static CORS origin allowlist. When omitted, `CORS_ORIGINS` (comma list)
   * is read from the environment. `*` is rejected when credentials or an API
   * key are configured.
   */
  corsOrigins?: string[];
  /** Loads the current allowlist of CORS origins; refreshed every 60 seconds. */
  corsOriginProvider?: () => Promise<string[]>;
  /**
   * Optional PolicyEngine instance.
   */
  policyEngine?: PolicyEngine;
  /**
   * Optional API key to protect server endpoints.
   * When set, requires 'Authorization: Bearer <api-key>' on all routes except /health and /metrics.
   */
  apiKey?: string;
  /**
   * Rate limiting window in milliseconds for /cosign and /fee-bump endpoints.
   */
  windowMs?: number;
  /**
   * Maximum requests allowed within windowMs for /cosign and /fee-bump endpoints.
   */
  max?: number;
  /**
   * Rate limit options for /cosign and /fee-bump endpoints.
   */
  rateLimit?: {
    windowMs?: number;
    max?: number;
  };
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  /**
   * Optional WalletRegistry to persist and list registered wallet addresses.
   * When provided, POST /wallet/create registers the new wallet and
   * GET /wallets lists all registered wallets.
   */
  walletRegistry?: WalletRegistry;
  /**
   * Optional readiness probe for downstream dependencies (Redis, PostgreSQL, ...).
   * Used by the /health endpoint so container healthchecks can verify the
   * server is healthy within 30 seconds.
   */
  readinessCheck?: () => Promise<Record<string, boolean>>;
  /**
   * Optional Redis client used by the token bucket rate limiter and the
   * idempotency middleware. When omitted, an in-memory fallback is used.
   */
  redis?: Redis;
  /** Optional publisher for hourly Merkle roots; Redis stores roots by default when configured. */
  publishAuditRoot?: (root: string, timestamp: string) => Promise<void>;
  /**
   * Token bucket configuration for per-client-IP rate limiting.
   * `capacity` is the maximum burst size; `refillRate` is the steady-state
   * number of tokens replenished per second.
   */
  ipRateLimit?: BucketConfig;
  /**
   * Token bucket configuration for per-wallet-address rate limiting.
   */
  walletRateLimit?: BucketConfig;
  /**
   * Optional RBAC configuration (JWT secret / role claim) for admin routes.
   */
  rbac?: RbacConfig;
  /**
   * Optional multi-tenant API key store. When provided, requests are
   * authenticated against tenant API keys and subject to per-tenant quotas.
   */
  tenantStore?: TenantStore;
  /**
   * Optional distributed sequence number allocator (Redis Redlock) shared by
   * the fee-sponsor and co-signer services.
   */
  sequenceAllocator?: SequenceAllocator;
  /**
   * Optional SEP-10 web authentication configuration. When provided, the
   * `/auth` router (challenge + token) is mounted.
   */
  sep10?: Sep10Config;
  /**
   * #519 — multi-network registry. When provided, each tenant/API key resolves
   * to its own Horizon/RPC/passphrase/sponsor configuration so a single
   * process can serve testnet and mainnet tenants in isolation. When omitted,
   * the legacy single-network configuration (`network`/`horizonUrl`/`rpcUrl`)
   * is used for every request.
   */
  networkRegistry?: NetworkRegistry | NetworkRegistryOptions;
  /**
   * Grace period (ms) used by the shutdown hook to drain in-flight requests.
   * Defaults to 15000.
   */
  shutdownGracePeriodMs?: number;
  /**
   * Maximum time (ms) the server waits to receive the complete request
   * headers from a client before closing the connection. Protects against
   * slowloris-style clients that trickle headers. Must be greater than
   * `keepAliveTimeout` and less than `requestTimeout`.
   * Defaults to `LUMEN_HTTP_HEADERS_TIMEOUT_MS` or 10000.
   */
  headersTimeout?: number;
  /**
   * Maximum time (ms) allowed for receiving the entire request (headers and
   * body) before the connection is closed. Must be greater than
   * `headersTimeout`.
   * Defaults to `LUMEN_HTTP_REQUEST_TIMEOUT_MS` or 30000.
   */
  requestTimeout?: number;
  /**
   * Time (ms) an idle keep-alive connection is kept open before being
   * closed. Must be less than `headersTimeout`.
   * Defaults to `LUMEN_HTTP_KEEP_ALIVE_TIMEOUT_MS` or 5000.
   */
  keepAliveTimeout?: number;
}

/** Reads a positive integer timeout (ms) from an env var, falling back to a default. */
function resolveTimeoutMs(value: number | undefined, envName: string, fallback: number): number {
  const raw = value ?? process.env[envName];
  if (raw === undefined || raw === "") return fallback;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${envName}: expected a positive number of milliseconds`);
  }
  return parsed;
}

/**
 * Parses and validates a CORS origin allowlist. Throws on malformed entries
 * and on the unsafe `*` wildcard when credentials/API keys are in use.
 */
function parseCorsOrigins(raw: string | string[] | undefined, allowWildcard: boolean): string[] {
  if (raw === undefined) return [];
  const entries = (Array.isArray(raw) ? raw : raw.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const origins: string[] = [];
  for (const entry of entries) {
    if (entry === "*") {
      if (!allowWildcard) {
        throw new Error(
          "CORS_ORIGINS cannot contain '*' when credentials or API keys are configured",
        );
      }
      origins.push(entry);
      continue;
    }
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(2);
      if (suffix.length === 0 || suffix.includes("/") || suffix.includes(":")) {
        throw new Error(`Invalid CORS wildcard origin: ${entry}`);
      }
      origins.push(entry.toLowerCase());
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error(`Invalid CORS origin: ${entry}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`CORS origin must use http(s): ${entry}`);
    }
    origins.push(parsed.origin.toLowerCase());
  }
  return origins;
}

/** Returns true when a request origin matches the allowlist. */
function isOriginAllowed(origin: string, origins: string[]): boolean {
  let requestOrigin: string;
  let hostname: string;
  try {
    const parsed = new URL(origin);
    requestOrigin = parsed.origin.toLowerCase();
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }

  return origins.some((entry) => {
    const normalized = entry.trim().toLowerCase();
    if (normalized === "*") return true;
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(1);
      return hostname.endsWith(suffix) && hostname !== suffix.slice(1);
    }
    return normalized.includes("://") ? normalized === requestOrigin : hostname === normalized;
  });
}

function getTransactionHash(xdr: string, networkPassphrase: string): string {
  const envelopeHash = createHash("sha256").update(xdr).digest("hex");
  try {
    const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    return transaction instanceof Transaction ? transaction.hash().toString("hex") : envelopeHash;
  } catch {
    return envelopeHash;
  }
}

/** Parses an optional numeric env var, returning undefined when unset/invalid. */
function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function getPackageVersion(): string {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.resolve(currentDir, "../package.json"),
      path.resolve(currentDir, "../../package.json"),
      path.resolve(process.cwd(), "package.json"),
      path.resolve(process.cwd(), "packages/server/package.json"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(p, "utf-8")) as { name?: string; version?: string };
          if (pkg.name === "@lumen/server" && typeof pkg.version === "string") {
            return pkg.version;
          }
        } catch {
          // ignore parsing error and continue
        }
      }
    }
  } catch {
    // fallback
  }
  return process.env.npm_package_version || "0.1.0";
}

/** Creates the Lumen API server, service graph, and policy engine. */
export function createServer(opts: ServerOpts): ServerResult {
  const port = opts.port ?? 3000;

  const client = new StellarClient({
    network: opts.network,
    horizonUrl: opts.horizonUrl,
    rpcUrl: opts.rpcUrl,
  });

  // #519 — tenant-scoped network registry. When configured, each request
  // resolves its own NetworkConfig (Horizon/RPC/passphrase/sponsor) from the
  // authenticated tenant; otherwise the legacy single-network client is used.
  const networkRegistry: NetworkRegistry | undefined =
    opts.networkRegistry instanceof NetworkRegistry
      ? opts.networkRegistry
      : opts.networkRegistry
        ? new NetworkRegistry(opts.networkRegistry)
        : undefined;

  // Per-network StellarClient cache so tenants on the same network share a
  // client while tenants on different networks never share one.
  const networkClients = new Map<string, StellarClient>();
  const getClientForNetwork = (config: NetworkConfig): StellarClient => {
    const key = `${config.network}|${config.horizonUrl}|${config.rpcUrl}`;
    let cached = networkClients.get(key);
    if (!cached) {
      cached = new StellarClient({
        network: config.network,
        horizonUrl: config.horizonUrl,
        rpcUrl: config.rpcUrl,
      });
      networkClients.set(key, cached);
    }
    return cached;
  };

  /**
   * Resolves the network configuration for a request. When a registry is
   * configured, the tenant id (set by the tenant auth middleware) selects the
   * network; unknown tenants fall back to the default network. When no
   * registry is configured, the legacy single-network client is returned.
   */
  const resolveNetworkForRequest = (
    req: Request,
  ): { config: NetworkConfig; client: StellarClient } => {
    if (!networkRegistry) {
      return {
        config: {
          network: client.config.network,
          horizonUrl: client.config.horizonUrl,
          rpcUrl: client.config.rpcUrl,
          networkPassphrase: client.networkPassphrase,
          sponsorPublicKey: opts.feePayerSigner.publicKey(),
        },
        client,
      };
    }

    const tenant = (req as Request & { tenant?: { id?: string } }).tenant;
    const config = networkRegistry.resolve(tenant?.id);
    return { config, client: getClientForNetwork(config) };
  };

  // #240 — latency-aware failover router across multiple Horizon/RPC endpoints.
  let stellarRouter: FailoverStellarClient | undefined;
  if (opts.stellarEndpoints && opts.stellarEndpoints.length > 1) {
    stellarRouter = new FailoverStellarClient({
      endpoints: opts.stellarEndpoints,
      healthCheckIntervalMs: opts.stellarHealthCheckIntervalMs,
    });
    stellarRouter.start();
  }

  // #241 — real-time anomaly/fraud detection.
  const fraudDetector =
    opts.fraudDetector ?? new FraudDetector(opts.fraudDetectorConfig ?? {});

  const policyEngine = opts.policyEngine ?? new PolicyEngine();
  const webhookDispatcher = opts.webhookDispatcher ?? new WebhookDispatcher();

  const cosignerService = new CosignerService({
    client,
    signer: opts.cosignerSigner,
    policyEngine,
    webhookDispatcher,
    fraudDetector,
    sequenceAllocator: opts.sequenceAllocator,
  });

  const feeSponsorService = new FeeSponsorService({
    client,
    signer: opts.feePayerSigner,
    webhookDispatcher,
    sequenceAllocator: opts.sequenceAllocator,
  });

  const sponsorRefillService = opts.sponsorRefillTransfer
    ? new SponsorRefillService({
        transfer: opts.sponsorRefillTransfer,
        targetBalanceXlm: opts.sponsorTargetBalanceXlm ?? opts.minSponsorBalance ?? 50,
        cooldownMs: opts.sponsorRefillCooldownMs,
      })
    : undefined;

  const sponsorMonitorService = new SponsorMonitorService({
    client,
    sponsorPublicKey: opts.feePayerSigner.publicKey(),
    minBalanceXlm: opts.minSponsorBalance,
    pollIntervalMs: opts.sponsorPollIntervalMs,
    webhookDispatcher,
    onLowBalance: sponsorRefillService
      ? async (balance, threshold) => {
          await sponsorRefillService.refillIfLow(balance, threshold);
        }
      : undefined,
  });

  const sponsorReserveService = new SponsorReserveService({
    client,
    sponsorPublicKey: opts.feePayerSigner.publicKey(),
  });

  const app = express();
  app.use((req, res, next) => {
    httpLogger(req as unknown as IncomingMessage, res, next);
  });
  app.use(express.json());

  // #509 — response compression. Bodies below the threshold are left as-is so
  // tiny payloads are not inflated by gzip framing overhead.
  app.use(compression({ threshold: 1024 }));

  // #509 — weak ETags for GET read endpoints. The hash is computed over the
  // uncompressed body (registered before compression flushes) and conditional
  // requests are answered with 304 + no body.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const originalSend = res.send.bind(res);
    res.send = ((body?: unknown) => {
      if (typeof body === "string" || Buffer.isBuffer(body)) {
        const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
        const etag = `W/"${createHash("sha1").update(payload).digest("hex")}"`;
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "no-cache");

        const ifNoneMatch = req.headers["if-none-match"];
        const candidates = Array.isArray(ifNoneMatch)
          ? ifNoneMatch
          : ifNoneMatch !== undefined
            ? [ifNoneMatch]
            : [];
        const matched = candidates.some((value) =>
          value
            .split(",")
            .map((token) => token.trim())
            .some((token) => token === "*" || token === etag || token === etag.slice(2)),
        );
        if (matched && res.statusCode >= 200 && res.statusCode < 300) {
          res.status(304);
          res.removeHeader("Content-Type");
          res.removeHeader("Content-Length");
          return originalSend();
        }
      }
      return originalSend(body as never);
    }) as typeof res.send;

    next();
  });

  const redis = opts.redis;
  const appendAuditRecordScript = `
local previous = redis.call('LINDEX', KEYS[1], -1)
if previous then
  if cjson.decode(previous)['hash'] ~= ARGV[1] then return 0 end
elseif ARGV[1] ~= '' then
  return 0
end
redis.call('RPUSH', KEYS[1], ARGV[2])
return 1
`;
  const auditLog = new MerkleAuditLog(
    redis
      ? {
          load: async () =>
            (await redis.lrange("lumen:audit:records", 0, -1)).map(parseAuditRecord),
          append: async (record) => {
            const result = await redis.eval(
              appendAuditRecordScript,
              1,
              "lumen:audit:records",
              record.prevHash,
              JSON.stringify(record),
            );
            return result === 1;
          },
        }
      : undefined,
  );
  void auditLog.ready().catch((error: unknown) => {
    logger.error({ error }, "Failed to load or verify stored audit log");
  });
  // #508 — CORS allowlist sourced from configuration and validated at startup.
  // `*` is unsafe when credentials or API keys are in use, so fail fast.
  const credentialsInUse = Boolean(opts.apiKey || opts.tenantStore || opts.cors?.credentials);
  const allowWildcard = !credentialsInUse;
  const staticCorsOrigins = parseCorsOrigins(
    opts.corsOrigins ?? process.env.CORS_ORIGINS,
    allowWildcard,
  );

  const corsOriginProvider =
    opts.corsOriginProvider ?? (redis ? () => redis.smembers("lumen:cors:origins") : undefined);
  let corsOriginCache: { origins: string[]; expiresAt: number } | undefined;
  let currentCorsOrigins: string[] = staticCorsOrigins;

  const resolveCorsOrigins = async (): Promise<string[]> => {
    if (!corsOriginProvider) return currentCorsOrigins;
    if (!corsOriginCache || corsOriginCache.expiresAt <= Date.now()) {
      const origins = parseCorsOrigins(await corsOriginProvider(), allowWildcard);
      corsOriginCache = { origins, expiresAt: Date.now() + 60_000 };
    }
    return corsOriginCache.origins;
  };

  const corsOptions: CorsOptions = {
    ...opts.cors,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      void resolveCorsOrigins()
        .then((origins) => {
          const allowed = isOriginAllowed(origin, origins);
          callback(allowed ? null : new Error("Origin is not allowed by CORS"), allowed);
        })
        .catch((error: unknown) =>
          callback(error instanceof Error ? error : new Error(String(error))),
        );
    },
  };
  app.use(cors(corsOptions));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.id) {
      res.setHeader("x-request-id", req.id as string);
    }
    next();
  });

  // Multi-tenant API key authentication + tiered quota enforcement.
  // Falls back to the legacy single global API key when no tenant store is
  // configured. /health and /metrics remain public.
  const tenantAuth = createTenantAuthMiddleware({
    tenantStore: opts.tenantStore,
    legacyApiKey: opts.apiKey,
    redis: opts.redis,
  });
  app.use(tenantAuth);

  // Token bucket rate limiting (sliding-window, burst + steady-state refill).
  // Backward-compatible options map windowMs/max onto bucket capacity/refill.
  const legacyWindowMs =
    opts.rateLimit?.windowMs ?? opts.rateLimitWindowMs ?? opts.windowMs ?? 60 * 1000;
  const legacyMax = opts.rateLimit?.max ?? opts.rateLimitMax ?? opts.max ?? 100;

  const ipRateLimit: BucketConfig = opts.ipRateLimit ?? {
    capacity: legacyMax,
    refillRate: legacyMax / (legacyWindowMs / 1000),
  };
  const walletRateLimit: BucketConfig = opts.walletRateLimit ?? {
    capacity: legacyMax,
    refillRate: legacyMax / (legacyWindowMs / 1000),
  };

  const rateLimiter = createTokenBucketRateLimiter({
    redis: opts.redis,
    ip: ipRateLimit,
    wallet: walletRateLimit,
  });

  // #510 — reloadable settings. These are re-read on SIGHUP; invalid values are
  // rejected and the previous values retained.
  let currentIpRateLimit: BucketConfig = ipRateLimit;
  let currentWalletRateLimit: BucketConfig = walletRateLimit;
  let currentLogLevel: string = logger.level;

  const reloadConfig = async (): Promise<boolean> => {
    try {
      const nextLogLevel = process.env.LOG_LEVEL ?? currentLogLevel;
      const nextCorsOrigins = parseCorsOrigins(
        process.env.CORS_ORIGINS ?? currentCorsOrigins,
        allowWildcard,
      );

      const nextIpRateLimit: BucketConfig = {
        capacity: Number(process.env.RATE_LIMIT_IP_CAPACITY ?? currentIpRateLimit.capacity),
        refillRate: Number(process.env.RATE_LIMIT_IP_REFILL ?? currentIpRateLimit.refillRate),
      };
      const nextWalletRateLimit: BucketConfig = {
        capacity: Number(process.env.RATE_LIMIT_WALLET_CAPACITY ?? currentWalletRateLimit.capacity),
        refillRate: Number(process.env.RATE_LIMIT_WALLET_REFILL ?? currentWalletRateLimit.refillRate),
      };

      for (const [name, bucket] of [
        ["RATE_LIMIT_IP", nextIpRateLimit],
        ["RATE_LIMIT_WALLET", nextWalletRateLimit],
      ] as const) {
        if (
          !Number.isFinite(bucket.capacity) ||
          !Number.isFinite(bucket.refillRate) ||
          bucket.capacity <= 0 ||
          bucket.refillRate <= 0
        ) {
          throw new Error(`Invalid ${name} configuration`);
        }
      }

      // Apply atomically only after every value has validated.
      logger.level = nextLogLevel;
      currentLogLevel = nextLogLevel;
      currentIpRateLimit = nextIpRateLimit;
      currentWalletRateLimit = nextWalletRateLimit;
      currentCorsOrigins = nextCorsOrigins;
      corsOriginCache = undefined;
      rateLimiter.updateConfig?.({ ip: nextIpRateLimit, wallet: nextWalletRateLimit });

      logger.info(
        { logLevel: nextLogLevel, corsOrigins: nextCorsOrigins.length },
        "Configuration reloaded",
      );
      return true;
    } catch (error) {
      logger.error({ error }, "Configuration reload rejected; keeping previous values");
      return false;
    }
  };

  const idempotency = createIdempotencyMiddleware({ redis: opts.redis });
  // #519 — anti-replay keys are scoped by the resolved network passphrase so
  // a replay on one network cannot collide with a different network's keys.
  const antiReplay = createAntiReplayMiddleware({
    redis: opts.redis,
    networkPassphrase: client.networkPassphrase,
    resolveNetworkPassphrase: (req: Request) =>
      resolveNetworkForRequest(req).config.networkPassphrase,
  });
  const rbac = createRbacMiddleware(opts.rbac);

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // #235 — SEP-10 web authentication (challenge + token issuance).
  if (opts.sep10) {
    app.use(
      "/auth",
      createSep10Router({
        ...opts.sep10,
        client,
        signer: opts.sep10.signer ?? opts.cosignerSigner,
      }),
    );
  }

  let activeRequests = 0;

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    activeRequests++;
    _res.on("finish", () => {
      activeRequests--;
    });
    next();
  });

  // #516 — the public health view is intentionally minimal: it must never leak
  // hostnames, versions, or dependency error details.
  app.get(
    "/health",
    wrapHandler(async (req, res) => {
      // #519 — probe the network resolved for this request's tenant.
      const { config: requestNetwork, client: requestClient } = resolveNetworkForRequest(req);
      let horizonConnected = false;
      try {
        await requestClient.horizon.root();
        horizonConnected = true;
      } catch {
        horizonConnected = false;
      }

      let dependencies: Record<string, boolean> = {};
      if (opts.readinessCheck) {
        try {
          dependencies = await opts.readinessCheck();
        } catch (error) {
          logger.error({ error }, "Readiness check failed");
          dependencies = { readiness: false };
        }
      }

      const dependenciesHealthy = Object.values(dependencies).every(Boolean);
      const healthy = horizonConnected && dependenciesHealthy;

      res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "degraded",
        horizonConnected,
        dependencies,
        network: requestNetwork.network,
        version: getPackageVersion(),
      });
      res.status(report.healthy ? 200 : 503).json(report);
    }),
  );

  app.get(
    "/health/deep",
    rbac.requirePermission("admin:read"),
    wrapHandler(async (_req: Request, res: Response) => {
      const report = await runDeepHealthCheck({
        client,
        cosignerSigner: opts.cosignerSigner,
        feeSponsorService,
        sponsorMonitorService,
        readinessCheck: opts.readinessCheck,
        minSponsorBalance: opts.minSponsorBalance,
      });
      res.status(report.healthy ? 200 : 503).json(report);
    }),
  );

  app.get(
    "/metrics",
    wrapHandler(async (_req: Request, res: Response) => {
      res.setHeader("Content-Type", register.contentType);
      res.send(await register.metrics());
    }),
  );

  // #507 — record request metrics using the normalised route pattern so raw
  // wallet addresses never leak into label values.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const routeLabel = resolveRouteLabel(req);
    res.on("finish", () => {
      logger.debug(
        { route: routeLabel, status: res.statusCode, method: req.method },
        "request completed",
      );
    });
    next();
  });

  // #505 — streaming audit log export (JSONL/CSV) with a signed manifest.
  app.get(
    "/audit/export",
    rbac.requirePermission("audit:read"),
    wrapHandler(
      createAuditExportHandler({
        auditLog,
        signer: opts.cosignerSigner,
      }),
    ),
  );

  app.get(
    "/sponsor/status",
    wrapHandler(async (_req: Request, res: Response) => {
      const status = await sponsorMonitorService.checkBalance();
      res.json(status);
    }),
  );

  // #585 — Per-wallet sponsored reserve accounting
  app.get(
    "/sponsor/reserves",
    rbac.requirePermission("wallets:read"),
    wrapHandler(async (req: Request, res: Response) => {
      const walletParam = req.query.wallet;
      let addresses: string[];
      if (walletParam !== undefined) {
        addresses = (Array.isArray(walletParam) ? walletParam : [walletParam]).map(String);
      } else if (opts.walletRegistry) {
        addresses = await opts.walletRegistry.list();
      } else {
        addresses = [];
      }

      const invalid = addresses.find((address) => !StrKey.isValidEd25519PublicKey(address));
      if (invalid !== undefined) {
        throw new ValidationError(`wallet must be a valid Stellar public key: ${invalid}`);
      }

      res.json(await sponsorReserveService.getReport(addresses));
    }),
  );

  app.post(
    "/cosign",
    rateLimiter,
    antiReplay,
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const timer = policyEvaluationDurationSeconds.startTimer();
      try {
        const parsed = CosignRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          cosignRequestsTotal.inc({ status: "rejected" });
          throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
        }

        // #519 — resolve the tenant's network so the passphrase used to parse
        // and hash the transaction matches the network it was built for.
        const { config: requestNetwork } = resolveNetworkForRequest(req);
        const result = await cosignerService.cosign(parsed.data);
        const transactionHash = getTransactionHash(parsed.data.xdr, requestNetwork.networkPassphrase);
        await auditLog.append({
          txHash: transactionHash,
          walletAddress: parsed.data.walletAddress,
          decision: result.approved ? "approved" : "rejected",
          rulesEvaluated: result.rulesEvaluated ?? [],
        });

        if (!result.approved) {
          cosignRequestsTotal.inc({ status: "rejected" });
          const transaction = TransactionBuilder.fromXDR(parsed.data.xdr, requestNetwork.networkPassphrase);
          const txHash = transaction.hash().toString("hex");
          broadcastAuditEvent({
            timestamp: new Date().toISOString(),
            decision: "rejected",
            wallet: parsed.data.walletAddress,
            txHash,
            reason: result.reason ?? "Transaction denied by policy",
          });
          broadcastWalletEvent(parsed.data.walletAddress, "policy_violated", {
            txHash,
            reason: result.reason ?? "Transaction denied by policy",
          });
          throw new PolicyError(result.reason ?? "Transaction denied by policy");
        }

        cosignRequestsTotal.inc({ status: "approved" });
        const transaction = TransactionBuilder.fromXDR(parsed.data.xdr, requestNetwork.networkPassphrase);
        const txHash = transaction.hash().toString("hex");
        broadcastAuditEvent({
          timestamp: new Date().toISOString(),
          decision: "approved",
          wallet: parsed.data.walletAddress,
          txHash,
        });
        broadcastWalletEvent(parsed.data.walletAddress, "cosigned", {
          txHash,
        });
        res.json({ signedXdr: result.signedXdr });
      } catch (err) {
        if (!(err instanceof ValidationError) && !(err instanceof PolicyError)) {
          cosignRequestsTotal.inc({ status: "rejected" });
        }
        throw err;
      } finally {
        timer();
      }
    }),
  );

  // #243 — batch co-signing with atomic policy evaluation.
  app.post(
    "/cosign/batch",
    rateLimiter,
    antiReplay,
    wrapHandler(async (req: Request, res: Response) => {
      const parsed = CosignBatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const { config: requestNetwork } = resolveNetworkForRequest(req);
      const results = await cosignerService.cosignBatch(parsed.data.transactions);
      await Promise.all(
        parsed.data.transactions.map((transaction, index) =>
          auditLog.append({
            txHash: getTransactionHash(transaction.xdr, requestNetwork.networkPassphrase),
            walletAddress: transaction.walletAddress,
            decision: results[index]?.approved ? "approved" : "rejected",
            rulesEvaluated: results[index]?.rulesEvaluated ?? [],
          }),
        ),
      );

      const allApproved = results.every((r) => r.approved);
      if (allApproved) {
        cosignRequestsTotal.inc({ status: "approved" }, results.length);
      } else {
        const approvedCount = results.filter((r) => r.approved).length;
        if (approvedCount > 0) {
          cosignRequestsTotal.inc({ status: "approved" }, approvedCount);
        }
        cosignRequestsTotal.inc({ status: "rejected" }, results.length - approvedCount);
      }

      const responseResults = results.map(({ rulesEvaluated: _rulesEvaluated, ...result }) => result);
      res.status(allApproved ? 200 : 207).json({ results: responseResults });
    }),
  );

  // #587 — co-sign Soroban authorization entries with contract allowlist checks.
  app.post(
    "/cosign/auth-entry",
    rateLimiter,
    antiReplay,
    wrapHandler(async (req: Request, res: Response) => {
      const parsed = CosignAuthEntryRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const result = await cosignerService.cosignAuthEntry(parsed.data);
      if (!result.approved) {
        throw new PolicyError(result.reason ?? "Authorization entry denied by policy");
      }

      res.json({ signedEntryXdr: result.signedEntryXdr });
    }),
  );

  app.post(
    "/fee-bump",
    rateLimiter,
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      feeBumpRequestsTotal.inc();
      const parsed = FeeBumpRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const feeBumpXdr = await feeSponsorService.wrapFeeBump(parsed.data.xdr);
      res.json({ feeBumpXdr });
    }),
  );

  app.post(
    "/fee-bump/submit",
    rateLimiter,
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      feeBumpRequestsTotal.inc();
      const parsed = FeeBumpRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const { config: requestNetwork } = resolveNetworkForRequest(req);
      const result = await feeSponsorService.submit(parsed.data.xdr);
      const submittedTransaction = TransactionBuilder.fromXDR(
        parsed.data.xdr,
        requestNetwork.networkPassphrase,
      );
      if (submittedTransaction instanceof Transaction) {
        broadcastWalletEvent(submittedTransaction.source, "submitted", { hash: result.hash });
      }
      res.json(result);
    }),
  );

  app.get("/policy/:walletId", (req: Request, res: Response) => {
    const policy = policyEngine.getPolicy(req.params.walletId as string);
    if (!policy) {
      throw new PolicyError("No policy found", 404);
    }
    res.setHeader("ETag", `"${policy.version}"`);
    res.json(policy);
  });

  // #499 — dry-run policy evaluation. Evaluates the supplied XDR against the
  // stored policy and returns the decision without cosigning or recording
  // velocity, so integrators can ask "would this pass?" safely.
  app.post(
    "/policy/:walletId/evaluate",
    rbac.requirePermission("policy:read"),
    wrapHandler(async (req: Request, res: Response) => {
      const walletId = req.params.walletId as string;
      const policy = policyEngine.getPolicy(walletId);
      if (!policy) {
        throw new PolicyError("No policy found", 404);
      }

      const body: unknown = req.body;
      const xdrValue =
        typeof body === "object" && body !== null && "xdr" in body
          ? (body as { xdr?: unknown }).xdr
          : undefined;
      if (typeof xdrValue !== "string" || xdrValue.trim() === "") {
        throw new ValidationError("xdr must be a non-empty string");
      }

      let transaction: Transaction;
      try {
        const parsed = TransactionBuilder.fromXDR(xdrValue, client.networkPassphrase);
        if (!(parsed instanceof Transaction)) {
          throw new Error("not a Transaction");
        }
        transaction = parsed;
      } catch {
        throw new ValidationError("xdr must be a valid Stellar transaction envelope");
      }

      const evaluation = policyEngine.evaluateDryRun(policy, transaction);
      res.json({
        approved: evaluation.approved,
        reason: evaluation.reason,
        results: evaluation.results,
      });
    }),
  );

  // #500 — immutable policy version history and rollback.
  app.get(
    "/policy/:id/versions",
    rbac.requirePermission("policy:read"),
    wrapHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const versions = await policyEngine.listPolicyVersions(id);
      if (versions === undefined) {
        throw new PolicyError("No policy found", 404);
      }
      res.json({ versions });
    }),
  );

  app.post(
    "/policy/:id/rollback",
    rbac.requirePermission("policy:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const body: unknown = req.body;
      const versionValue =
        typeof body === "object" && body !== null && "version" in body
          ? (body as { version?: unknown }).version
          : undefined;
      if (typeof versionValue !== "number" || !Number.isInteger(versionValue) || versionValue < 1) {
        throw new ValidationError("version must be a positive integer");
      }

      const actor = req.tenant?.id ?? req.tenant?.name ?? "api";
      const policy = await policyEngine.rollbackPolicy(id, versionValue, actor);
      if (!policy) {
        throw new PolicyError("No policy found", 404);
      }

      res.setHeader("ETag", `"${policy.version}"`);
      res.json(policy);
    }),
  );

  // #501 — named policy templates and JSON import/export.
  app.get(
    "/policy/templates",
    rbac.requirePermission("policy:read"),
    wrapHandler(async (_req: Request, res: Response) => {
      res.json({ templates: policyEngine.listTemplates() });
    }),
  );

  app.post(
    "/policy/templates/:name/apply",
    rbac.requirePermission("policy:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const name = req.params.name as string;
      const body: unknown = req.body;
      const walletId =
        typeof body === "object" && body !== null && "walletId" in body
          ? (body as { walletId?: unknown }).walletId
          : undefined;
      if (typeof walletId !== "string" || walletId.trim() === "") {
        throw new ValidationError("walletId must be a non-empty string");
      }

      const policy = await policyEngine.createPolicyFromTemplate(name, walletId);
      if (!policy) {
        throw new PolicyError("Unknown policy template", 404);
      }

      res.status(201).json(policy);
    }),
  );

  app.get(
    "/policy/:walletId/export",
    rbac.requirePermission("policy:read"),
    wrapHandler(async (req: Request, res: Response) => {
      const walletId = req.params.walletId as string;
      const policy = policyEngine.getPolicy(walletId);
      if (!policy) {
        throw new PolicyError("No policy found", 404);
      }
      res.json(policy);
    }),
  );

  app.post(
    "/policy/import",
    rbac.requirePermission("policy:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const policy = await policyEngine.importPolicy(req.body);
      if (!policy) {
        throw new ValidationError("Invalid policy document");
      }
      res.status(201).json(policy);
    }),
  );

  app.post(
    "/policy",
    rbac.requirePermission("policy:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const parsed = PolicyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      if (policyEngine.getPolicy(parsed.data.walletId)) {
        throw new PolicyError("A policy already exists for this wallet", 409);
      }

      const policy = {
        id: crypto.randomUUID(),
        walletId: parsed.data.walletId,
        rules: parsed.data.rules,
        createdAt: new Date(),
        version: 1,
      };

      policyEngine.addPolicy(policy);
      res.status(201).json(policy);
    }),
  );

  app.put(
    "/policy/:walletId",
    rbac.requirePermission("policy:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const parsed = PolicyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const walletId = req.params.walletId as string;
      if (parsed.data.walletId !== walletId) {
        throw new ValidationError("walletId in the request body must match the URL");
      }

      const existingPolicy = policyEngine.getPolicy(walletId);
      if (!existingPolicy) {
        throw new PolicyError("No policy found", 404);
      }

      // #366 — optimistic concurrency control via If-Match / ETag.
      const ifMatch = req.headers["if-match"];
      const ifMatchValue = Array.isArray(ifMatch) ? ifMatch[0] : ifMatch;
      if (ifMatchValue === undefined || ifMatchValue.trim() === "") {
        throw new PolicyError(
          "If-Match header is required to update a policy",
          412,
        );
      }

      const normalized = ifMatchValue.trim().replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
      const expectedVersion = Number(normalized);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== existingPolicy.version) {
        throw new PolicyError(
          `Policy version mismatch: expected version ${existingPolicy.version}`,
          412,
        );
      }

      const policy = {
        ...existingPolicy,
        rules: parsed.data.rules,
        version: existingPolicy.version + 1,
      };

      policyEngine.addPolicy(policy);
      res.setHeader("ETag", `"${policy.version}"`);
      res.json(policy);
    }),
  );

  app.delete("/policy/:walletId", rbac.requirePermission("policy:write"), (req: Request, res: Response) => {
    const walletId = req.params.walletId as string;
    if (!policyEngine.getPolicy(walletId)) {
      throw new PolicyError("No policy found", 404);
    }

    policyEngine.removePolicy(walletId);
    res.status(204).send();
  });

  app.post(
    "/wallet/create",
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const body: unknown = req.body;
      const ownerPublicKey =
        typeof body === "object" && body !== null && "ownerPublicKey" in body
          ? body.ownerPublicKey
          : undefined;

      if (ownerPublicKey !== undefined) {
        if (
          typeof ownerPublicKey !== "string" ||
          !StrKey.isValidEd25519PublicKey(ownerPublicKey)
        ) {
          throw new ValidationError("ownerPublicKey must be a valid Stellar public key");
        }

        const { config: requestNetwork, client: requestClient } = resolveNetworkForRequest(req);
        const sponsor = Keypair.fromPublicKey(
          requestNetwork.sponsorPublicKey ?? opts.feePayerSigner.publicKey(),
        );
        const sponsorAccount = await requestClient.horizon.loadAccount(sponsor.publicKey());
        const createTx = new TransactionBuilder(sponsorAccount, {
          fee: BASE_FEE,
          networkPassphrase: requestNetwork.networkPassphrase,
        })
          .addOperation(
            Operation.createAccount({
              destination: ownerPublicKey,
              startingBalance: "10",
            }),
          )
          .setTimeout(180)
          .build();
        const signature = await opts.feePayerSigner.sign(createTx.hash());
        createTx.signatures.push(
          new xdr.DecoratedSignature({
            hint: sponsor.rawPublicKey().slice(-4),
            signature: Buffer.from(signature),
          }),
        );
        await requestClient.horizon.submitTransaction(createTx);

        if (opts.walletRegistry) {
          await opts.walletRegistry.register(ownerPublicKey);
        }

        void webhookDispatcher
          .dispatch("wallet.created", {
            address: ownerPublicKey,
            publicKey: ownerPublicKey,
          })
          .catch((error: unknown) => {
            logger.error({ error }, "Failed to dispatch wallet.created webhook");
          });
        res.json({ address: ownerPublicKey, publicKey: ownerPublicKey });
        return;
      }

      const { Wallet } = await import("@lumen/core");

      const { config: requestNetwork, client: requestClient } = resolveNetworkForRequest(req);
      const sponsorKeypair = Keypair.fromPublicKey(opts.cosignerSigner.publicKey());
      const wallet = new Wallet({
        client: requestClient,
        sponsorKeypair,
        serverPublicKey: opts.cosignerSigner.publicKey(),
      });

      const result = await wallet.create();

      // Register the new wallet address if a registry is configured
      if (opts.walletRegistry) {
        await opts.walletRegistry.register(result.address);
      }

      void webhookDispatcher
        .dispatch("wallet.created", {
          address: result.address,
          publicKey: result.publicKey,
        })
        .catch((error: unknown) => {
          logger.error({ error }, "Failed to dispatch wallet.created webhook");
        });
      res.json({ address: result.address, publicKey: result.publicKey });
    }),
  );

  // #169 — GET /wallets: list all registered wallets
  // #515 — optional `tag` filter narrows the result set by wallet tag.
  app.get(
    "/wallets",
    rbac.requirePermission("wallets:read"),
    wrapHandler(async (req: Request, res: Response) => {
      if (!opts.walletRegistry) {
        res.json({ wallets: [], total: 0 });
        return;
      }

      const tagParam = req.query.tag;
      if (tagParam !== undefined && typeof tagParam !== "string") {
        throw new ValidationError("tag must be a single string");
      }

      const allWallets = await opts.walletRegistry.listWallets(
        tagParam !== undefined ? { tag: tagParam } : undefined,
      );

      const limitParam = req.query.limit;
      const offsetParam = req.query.offset;

      const limit = limitParam === undefined ? 50 : Math.max(1, Math.min(200, Number(limitParam)));
      const offset = offsetParam === undefined ? 0 : Math.max(0, Number(offsetParam));

      const paginated = allWallets.slice(offset, offset + limit);

      res.json({ wallets: paginated, total: allWallets.length });
    }),
  );

  // #515 — PATCH /wallets/:address: update label, tags, and size-limited metadata.
  app.patch(
    "/wallets/:address",
    rbac.requirePermission("wallets:update"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const address = req.params.address as string;
      if (!StrKey.isValidEd25519PublicKey(address)) {
        throw new ValidationError("address must be a valid Stellar public key");
      }

      const parsed = WalletPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      if (!opts.walletRegistry) {
        res.status(404).json({ error: "Wallet not found" });
        return;
      }

      const updated = await opts.walletRegistry.updateWalletMetadata(address, parsed.data);
      if (!updated) {
        res.status(404).json({ error: "Wallet not found" });
        return;
      }

      res.json(updated);
    }),
  );

  // #586 — Wallet closure: remove the wallet's sponsored subentries (returning
  // their reserves to the sponsor) and merge the account into a destination.
  // The co-signer signs only after policy approval; the owner adds the final
  // signature and submits.
  app.post(
    "/wallets/:address/close",
    rbac.requirePermission("wallets:update"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const address = req.params.address as string;
      if (!StrKey.isValidEd25519PublicKey(address)) {
        throw new ValidationError("address must be a valid Stellar public key");
      }

      const parsed = WalletCloseSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }
      const { destination } = parsed.data;
      if (destination === address) {
        throw new ValidationError("destination must differ from the wallet address");
      }

      const isNotFound = (error: unknown): boolean =>
        (error as { response?: { status?: number } } | null)?.response?.status === 404;

      const { config: requestNetwork, client: requestClient } = resolveNetworkForRequest(req);

      try {
        await requestClient.horizon.loadAccount(destination);
      } catch (error) {
        if (isNotFound(error)) {
          throw new ValidationError("destination account does not exist");
        }
        throw error;
      }

      let account: Awaited<ReturnType<typeof requestClient.horizon.loadAccount>>;
      try {
        account = await requestClient.horizon.loadAccount(address);
      } catch (error) {
        if (isNotFound(error)) {
          res.status(404).json({ error: "Wallet not found" });
          return;
        }
        throw error;
      }

      const balances = (account.balances ?? []) as Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>;
      const trustlines = balances.filter((b) => b.asset_type !== "native");
      const funded = trustlines.find(
        (b) => b.asset_type === "liquidity_pool_shares" || Number(b.balance) !== 0,
      );
      if (funded !== undefined) {
        throw new ValidationError(
          "All non-native balances must be zero before the wallet can be closed",
        );
      }

      const reserves = await sponsorReserveService.getWalletReserves(address);

      const builder = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: requestNetwork.networkPassphrase,
      });
      for (const name of Object.keys(account.data_attr ?? {})) {
        builder.addOperation(Operation.manageData({ name, value: null }));
      }
      for (const trustline of trustlines) {
        builder.addOperation(
          Operation.changeTrust({
            asset: new Asset(trustline.asset_code as string, trustline.asset_issuer),
            limit: "0",
          }),
        );
      }
      const signers = (account.signers ?? []) as Array<{ key: string; type: string }>;
      for (const signer of signers) {
        if (signer.key === address) continue;
        if (signer.type === "ed25519_public_key") {
          builder.addOperation(
            Operation.setOptions({ signer: { ed25519PublicKey: signer.key, weight: 0 } }),
          );
        } else if (signer.type === "sha256_hash") {
          builder.addOperation(
            Operation.setOptions({
              signer: { sha256Hash: StrKey.decodeSha256Hash(signer.key), weight: 0 },
            }),
          );
        } else if (signer.type === "preauth_tx") {
          builder.addOperation(
            Operation.setOptions({
              signer: { preAuthTx: StrKey.decodePreAuthTx(signer.key), weight: 0 },
            }),
          );
        }
      }
      builder.addOperation(Operation.accountMerge({ destination }));
      const closeTx = builder.setTimeout(180).build();
      const txHash = closeTx.hash().toString("hex");

      const result = policyEngine.evaluateWithAudit({
        walletAddress: address,
        transaction: closeTx,
      });
      await auditLog.append({
        txHash,
        walletAddress: address,
        decision: result.approved ? "approved" : "rejected",
        rulesEvaluated: [...(result.rulesEvaluated ?? []), "wallet:close"],
      });
      if (!result.approved) {
        broadcastAuditEvent({
          timestamp: new Date().toISOString(),
          decision: "rejected",
          wallet: address,
          txHash,
          reason: result.reason ?? "Wallet closure denied by policy",
        });
        throw new PolicyError(result.reason ?? "Wallet closure denied by policy");
      }

      const cosignerPublicKey = opts.cosignerSigner.publicKey();
      if (signers.some((s) => s.key === cosignerPublicKey)) {
        const signature = await opts.cosignerSigner.sign(closeTx.hash());
        closeTx.signatures.push(
          new xdr.DecoratedSignature({
            hint: Keypair.fromPublicKey(cosignerPublicKey).rawPublicKey().slice(-4),
            signature: Buffer.from(signature),
          }),
        );
      }

      broadcastAuditEvent({
        timestamp: new Date().toISOString(),
        decision: "approved",
        wallet: address,
        txHash,
      });
      res.json({
        address,
        destination,
        txHash,
        xdr: closeTx.toXDR(),
        reclaimedReserves: reserves.reserves,
        reclaimedXlm: reserves.lockedXlm,
      });
    }),
  );

  // #170 — GET /policy: list all configured policies
  app.get(
    "/policy",
    wrapHandler(async (_req: Request, res: Response) => {
      const policies = policyEngine.listPolicies();
      res.json({ policies, count: policies.length });
    }),
  );

  app.get(
    "/wallet/:address/transactions",
    wrapHandler(async (req: Request, res: Response) => {
      const address = req.params.address as string;
      if (!StrKey.isValidEd25519PublicKey(address)) {
        throw new ValidationError("address must be a valid Stellar public key");
      }

      const limitParam = req.query.limit;
      const limit = limitParam === undefined ? 20 : Number(limitParam);
      if (
        (limitParam !== undefined && typeof limitParam !== "string") ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200
      ) {
        throw new ValidationError("limit must be an integer between 1 and 200");
      }

      const cursorParam = req.query.cursor;
      if (cursorParam !== undefined && typeof cursorParam !== "string") {
        throw new ValidationError("cursor must be a string");
      }

      const { client: requestClient } = resolveNetworkForRequest(req);
      let transactions = requestClient.horizon
        .transactions()
        .forAccount(address)
        .order("desc")
        .limit(limit);
      if (cursorParam) {
        transactions = transactions.cursor(cursorParam);
      }
      const page = await transactions.call();
      const records = page.records;
      res.json({
        address,
        transactions: records,
        nextCursor: records.at(-1)?.paging_token ?? null,
      });
    }),
  );

  app.get(
    "/wallet/:address/balance",
    wrapHandler(async (req: Request, res: Response) => {
      const address = req.params.address as string;
      if (!StrKey.isValidEd25519PublicKey(address)) {
        throw new ValidationError("address must be a valid Stellar public key");
      }

      const { client: requestClient } = resolveNetworkForRequest(req);
      const account = await requestClient.horizon.loadAccount(address);
      res.json({ address, balances: account.balances });
    }),
  );

  app.post(
    "/webhooks",
    rbac.requirePermission("webhooks:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const parsed = WebhookRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }
      const { id: bodyId, url, secret, events, enabled } = parsed.data;
      const id = bodyId ?? crypto.randomUUID();
      webhookDispatcher.register({ id, url, secret, events, enabled: enabled ?? true });
      res.status(201).json({ id, url, events, enabled: enabled ?? true });
    }),
  );

  app.get("/webhooks", (_req: Request, res: Response) => {
    res.json(webhookDispatcher.list().map(({ secret: _secret, ...rest }) => rest));
  });

  app.delete("/webhooks/:id", rbac.requirePermission("webhooks:write"), (req: Request, res: Response) => {
    const deleted = webhookDispatcher.unregister(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }
    res.status(204).send();
  });

  app.patch(
    "/webhooks/:id",
    rbac.requirePermission("webhooks:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;

      const parsed = WebhookPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const updated = webhookDispatcher.update(id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }

      const { secret: _secret, ...safeConfig } = updated;
      res.json(safeConfig);
    }),
  );

  app.post(
    "/webhooks/:id/test",
    rbac.requirePermission("webhooks:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;

      if (!webhookDispatcher.get(id)) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }

      const result = await webhookDispatcher.sendTest(id);
      res.json({
        success: result.success,
        statusCode: result.statusCode ?? null,
        attempts: result.attempts,
        responseTimeMs: result.responseTimeMs,
      });
    }),
  );

  app.get(
    "/webhooks/deliveries",
    wrapHandler(async (req: Request, res: Response) => {
      const fullLog = await webhookDispatcher.getDeliveryLog();
      const limitParam = req.query.limit;
      const offsetParam = req.query.offset;

      if (limitParam === undefined && offsetParam === undefined) {
        res.json(fullLog);
        return;
      }

      const limit = limitParam === undefined ? 50 : Math.max(1, Math.min(200, Number(limitParam)));
      const offset = offsetParam === undefined ? 0 : Math.max(0, Number(offsetParam));
      const paginated = fullLog.slice(offset, offset + limit);

      res.json(paginated);
    }),
  );

  // #236 — per-webhook delivery history and manual retry of DLQ entries.
  app.get(
    "/webhooks/:id/deliveries",
    wrapHandler(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      if (!webhookDispatcher.get(id)) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }
      res.json(await webhookDispatcher.getDeliveries(id));
    }),
  );

  app.post(
    "/webhooks/deliveries/:id/retry",
    rbac.requirePermission("webhooks:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const deliveryId = req.params.id as string;
      const result = await webhookDispatcher.retryDelivery(deliveryId);
      if (!result) {
        res.status(404).json({ error: "Delivery not found" });
        return;
      }
      res.json(result);
    }),
  );

  // #518 — dead-letter inspection and replay for failed webhook deliveries.
  app.get(
    "/webhooks/dlq",
    rbac.requirePermission("webhooks:read"),
    wrapHandler(async (req: Request, res: Response) => {
      const entries = await webhookDispatcher.listDeadLetters();

      const limitParam = req.query.limit;
      const offsetParam = req.query.offset;
      const limit = limitParam === undefined ? 50 : Math.max(1, Math.min(200, Number(limitParam)));
      const offset = offsetParam === undefined ? 0 : Math.max(0, Number(offsetParam));

      res.json({
        entries: entries.slice(offset, offset + limit),
        total: entries.length,
      });
    }),
  );

  app.post(
    "/webhooks/dlq/:id/replay",
    rbac.requirePermission("webhooks:write"),
    idempotency,
    wrapHandler(async (req: Request, res: Response) => {
      const deadLetterId = req.params.id as string;
      const result = await webhookDispatcher.replayDeadLetter(deadLetterId);
      if (!result) {
        res.status(404).json({ error: "Dead-letter entry not found" });
        return;
      }

      await auditLog.append({
        txHash: `webhook-dlq:${deadLetterId}`,
        walletAddress: result.webhookId ?? "webhook",
        decision: result.success ? "approved" : "rejected",
        rulesEvaluated: ["webhook:dlq-replay"],
      });

      res.json(result);
    }),
  );

  // GraphQL gateway (queries + SSE subscriptions) served alongside the REST endpoints.
  // #519 — when a network registry is configured, the gateway resolves the
  // tenant's network per request instead of using the legacy single client.
  const graphqlGateway = createGraphQLGateway({
    client,
    policyEngine,
    resolveClient: networkRegistry
      ? (req: Request) => resolveNetworkForRequest(req).client
      : undefined,
  });
  app.use(graphqlGateway.graphqlEndpoint, graphqlGateway);

  app.use(errorHandler);

  const server = createHttpServer(app as unknown as RequestListener);

  // #511 — slow-client protection. Bound header/request/keep-alive durations so
  // a slowloris-style client cannot hold sockets open indefinitely.
  const headersTimeout = resolveTimeoutMs(
    opts.headersTimeout,
    "LUMEN_HTTP_HEADERS_TIMEOUT_MS",
    10_000,
  );
  const requestTimeout = resolveTimeoutMs(
    opts.requestTimeout,
    "LUMEN_HTTP_REQUEST_TIMEOUT_MS",
    30_000,
  );
  const keepAliveTimeout = resolveTimeoutMs(
    opts.keepAliveTimeout,
    "LUMEN_HTTP_KEEP_ALIVE_TIMEOUT_MS",
    5_000,
  );
  if (keepAliveTimeout >= headersTimeout) {
    throw new Error(
      `keepAliveTimeout (${keepAliveTimeout}ms) must be less than headersTimeout (${headersTimeout}ms)`,
    );
  }
  if (requestTimeout <= headersTimeout) {
    throw new Error(
      `requestTimeout (${requestTimeout}ms) must be greater than headersTimeout (${headersTimeout}ms)`,
    );
  }
  server.headersTimeout = headersTimeout;
  server.requestTimeout = requestTimeout;
  server.keepAliveTimeout = keepAliveTimeout;

  // Real-time audit stream consumed by `lumen audit --follow`.
  const auditWebSocketServer = new WebSocketServer({ noServer: true });
  const auditClients = new Set<WebSocket>();
  const walletWebSocketServer = createWalletWebSocketServer();

  const broadcastAuditEvent = (event: AuditEvent): void => {
    const payload = JSON.stringify(event);
    for (const socket of auditClients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  };

  const broadcastWalletEvent = (
    walletAddress: string,
    event: string,
    payload: Record<string, unknown> = {},
  ): void => {
    walletWebSocketServer.broadcast(walletAddress, event, payload);
  };

  const ledgerIngestionWorker = opts.walletRegistry && opts.updateLedgerTransaction
    ? new LedgerIngestionWorker({
        client,
        listWalletAddresses: async () => opts.walletRegistry!.list(),
        updateTransaction: opts.updateLedgerTransaction,
        onUpdate: (update) => {
          broadcastWalletEvent(update.walletAddress, "confirmed", {
            hash: update.hash,
            status: update.status,
            fee: update.fee,
            ledger: update.ledger,
          });
        },
      })
    : undefined;
  const publishAuditRoot = async (): Promise<void> => {
    await auditLog.ready();
    const root = auditLog.merkleRoot();
    if (!root) return;
    const timestamp = new Date().toISOString();
    if (opts.publishAuditRoot) {
      await opts.publishAuditRoot(root, timestamp);
    } else if (opts.redis) {
      await opts.redis.set(
        `lumen:audit:merkle:${timestamp.slice(0, 13)}`,
        root,
        "EX",
        365 * 24 * 60 * 60,
      );
    }
  };
  const auditRootInterval =
    opts.publishAuditRoot || opts.redis
      ? setInterval(() => {
          publishAuditRoot().catch((error: unknown) => {
            logger.error({ error }, "Failed to publish audit Merkle root");
          });
        }, 60 * 60 * 1000)
      : null;
  auditRootInterval?.unref();

  auditWebSocketServer.on("connection", (socket: WebSocket) => {
    auditClients.add(socket);
    socket.on("close", () => {
      auditClients.delete(socket);
    });
    socket.on("error", () => {
      auditClients.delete(socket);
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/audit/stream") {
      const authHeader = req.headers.authorization;
      const bearerToken =
        authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.substring(7).trim()
          : undefined;
      const urlObj = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
      const queryToken = urlObj.searchParams.get("token") ?? undefined;
      const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
      const providedKey = bearerToken || queryToken || apiKeyHeader;

      const expectedApiKey = opts.apiKey || process.env.LUMEN_API_KEY;
      const jwtSecret = process.env.JWT_SECRET;
      const tenantStore = opts.tenantStore;

      let authenticated = false;
      let failureStatus = 401;

      // 1. Check API key if configured
      if (expectedApiKey) {
        if (providedKey && providedKey === expectedApiKey) {
          authenticated = true;
        } else {
          failureStatus = 401;
          authenticated = false;
        }
      }

      // 2. Check RBAC / JWT claims if configured
      if (!authenticated && (opts.rbac || jwtSecret)) {
        if (!req.headers.authorization && providedKey) {
          req.headers.authorization = `Bearer ${providedKey}`;
        }
        const claims = parseClaims(req as Request);
        if (claims) {
          const permissions = ROLE_PERMISSIONS[claims.role] ?? [];
          if (permissions.includes("audit:read")) {
            authenticated = true;
          } else {
            failureStatus = 403;
            authenticated = false;
          }
        } else {
          failureStatus = 401;
          authenticated = false;
        }
      }

      // 3. Check tenant store if configured
      if (!authenticated && tenantStore) {
        if (providedKey) {
          const tenant = tenantStore.findByApiKeyHash(hashApiKey(providedKey));
          if (tenant) {
            const origin = req.headers.origin as string | undefined;
            const allowedDomains = tenant.allowedDomains ?? [];
            let domainAllowed = true;
            if (allowedDomains.length > 0 && origin) {
              try {
                const host = new URL(origin).hostname.toLowerCase();
                domainAllowed = allowedDomains.some((d) => {
                  const norm = d.toLowerCase().trim();
                  if (norm.startsWith("*.")) {
                    return host.endsWith(norm.slice(1)) || host === norm.slice(2);
                  }
                  return host === norm;
                });
              } catch {
                domainAllowed = false;
              }
            }
            if (domainAllowed) {
              authenticated = true;
            } else {
              failureStatus = 403;
              authenticated = false;
            }
          } else {
            failureStatus = 401;
            authenticated = false;
          }
        } else {
          failureStatus = 401;
          authenticated = false;
        }
      }

      // 4. If no authentication is configured at all, pass through
      if (!expectedApiKey && !opts.rbac && !jwtSecret && !tenantStore) {
        authenticated = true;
      }

      if (!authenticated) {
        const statusText = failureStatus === 403 ? "Forbidden" : "Unauthorized";
        socket.write(
          `HTTP/1.1 ${failureStatus} ${statusText}\r\n` +
            "Content-Type: text/plain\r\n" +
            `Content-Length: ${statusText.length}\r\n` +
            "Connection: close\r\n\r\n" +
            statusText,
        );
        socket.destroy();
        return;
      }

      auditWebSocketServer.handleUpgrade(req, socket, head, (ws) => {
        auditWebSocketServer.emit("connection", ws, req);
      });
      return;
    }

    if (pathname === "/ws") {
      walletWebSocketServer.server.handleUpgrade(req, socket, head, (ws) => {
        walletWebSocketServer.server.emit("connection", ws, req);
      });
      return;
    }

    socket.destroy();
  });

  sponsorMonitorService.start();
  ledgerIngestionWorker?.start();

  server.listen(port, () => {
    logger.info(
      {
        port,
        network: client.config.network,
        networks: networkRegistry ? networkRegistry.list().map((n) => n.network) : undefined,
      },
      `Lumen server listening on port ${port}`,
    );
    logger.info(
      { cosigner: opts.cosignerSigner.publicKey(), feePayer: opts.feePayerSigner.publicKey() },
      "Signer addresses initialized",
    );
  });

  /**
   * Stops accepting new connections and drains in-flight requests within the
   * grace period. Used by the lifecycle handler (SIGINT/SIGTERM).
   */
  const shutdown = (gracePeriodMs: number = opts.shutdownGracePeriodMs ?? 15000): Promise<void> => {
    sponsorMonitorService.stop();
    ledgerIngestionWorker?.stop();
    stellarRouter?.stop();
    if (auditRootInterval) clearInterval(auditRootInterval);

    for (const socket of auditClients) {
      socket.close();
    }
    for (const socket of walletWebSocketServer.server.clients) {
      socket.close();
    }
    auditWebSocketServer.close();
    walletWebSocketServer.server.close();

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
      };

      const timeout = setTimeout(() => {
        logger.error({ gracePeriodMs }, "Forced shutdown after grace period elapsed");
        finish();
      }, gracePeriodMs);
      if (typeof timeout.unref === "function") timeout.unref();

      // Stop accepting new connections; the callback fires once all in-flight
      // requests have completed.
      server.close(() => {
        logger.info("HTTP server closed");
        finish();
      });

      const checkInterval = setInterval(() => {
        if (activeRequests === 0) {
          server.close(() => {
            logger.info("HTTP server closed");
            finish();
          });
        }
      }, 100);
      if (typeof checkInterval.unref === "function") checkInterval.unref();
    });
  };

  return {
    app,
    server,
    client,
    networkRegistry,
    stellarRouter,
    fraudDetector,
    cosignerService,
    feeSponsorService,
    sponsorMonitorService,
    ledgerIngestionWorker,
    policyEngine,
    webhookDispatcher,
    auditWebSocketServer,
    walletWebSocketServer: walletWebSocketServer.server,
    broadcastAuditEvent,
    broadcastWalletEvent,
    auditLog,
    reloadConfig,
    shutdown,
  };
}
