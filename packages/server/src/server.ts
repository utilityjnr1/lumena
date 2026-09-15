import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Keypair } from "@stellar/stellar-sdk";
import { StellarClient } from "@lumen/core";
import type { Signer } from "@lumen/types";
import { CosignerService } from "./cosigner/service.js";
import { FeeSponsorService } from "./fee-sponsor/service.js";
import { PolicyEngine } from "./policy/engine.js";
import {
  CosignRequestSchema,
  FeeBumpRequestSchema,
  PolicyRequestSchema,
} from "./validation.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi.js";
import {
  ValidationError,
  PolicyError,
  errorHandler,
  wrapHandler,
} from "./errors.js";
import { logger, httpLogger } from "./logger.js";
import {
  register,
  cosignRequestsTotal,
  feeBumpRequestsTotal,
  policyEvaluationDurationSeconds,
} from "./metrics.js";

import { SponsorMonitorService } from "./fee-sponsor/monitor.js";

export interface ServerResult {
  app: Express;
  server: HttpServer;
  client: StellarClient;
  cosignerService: CosignerService;
  feeSponsorService: FeeSponsorService;
  sponsorMonitorService: SponsorMonitorService;
  policyEngine: PolicyEngine;
}

export interface ServerOpts {
  port?: number;
  network?: "testnet" | "mainnet" | "local";
  horizonUrl?: string;
  rpcUrl?: string;
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
}

export function createServer(opts: ServerOpts): ServerResult {
  const port = opts.port ?? 3000;

  const client = new StellarClient({
    network: opts.network,
    horizonUrl: opts.horizonUrl,
    rpcUrl: opts.rpcUrl,
  });

  const policyEngine = new PolicyEngine();

  const cosignerService = new CosignerService({
    client,
    signer: opts.cosignerSigner,
    policyEngine,
  });

  const feeSponsorService = new FeeSponsorService({
    client,
    signer: opts.feePayerSigner,
  });

  const sponsorMonitorService = new SponsorMonitorService({
    client,
    sponsorPublicKey: opts.feePayerSigner.publicKey(),
    minBalanceXlm: opts.minSponsorBalance,
    pollIntervalMs: opts.sponsorPollIntervalMs,
  });

  const app = express();
  app.use(httpLogger);
  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.id) {
      res.setHeader("x-request-id", req.id as string);
    }
    next();
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  let activeRequests = 0;

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    activeRequests++;
    _res.on("finish", () => {
      activeRequests--;
    });
    next();
  });

  app.get("/health", wrapHandler(async (_req, res) => {
    let horizonConnected = false;
    try {
      await client.horizon.server.fetchTime();
      horizonConnected = true;
    } catch {
      horizonConnected = false;
    }

    res.json({
      status: "ok",
      horizonConnected,
      network: client.config.network,
      version: "0.1.0",
    });
  }));

  app.get("/metrics", wrapHandler(async (_req: Request, res: Response) => {
    res.setHeader("Content-Type", register.contentType);
    res.send(await register.metrics());
  }));

  app.get("/sponsor/status", wrapHandler(async (_req: Request, res: Response) => {
    const status = await sponsorMonitorService.checkBalance();
    res.json(status);
  }));

  app.post("/cosign", wrapHandler(async (req: Request, res: Response) => {
    const timer = policyEvaluationDurationSeconds.startTimer();
    try {
      const parsed = CosignRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        cosignRequestsTotal.inc({ status: "rejected" });
        throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const result = await cosignerService.cosign(parsed.data);

      if (!result.approved) {
        cosignRequestsTotal.inc({ status: "rejected" });
        throw new PolicyError(result.reason ?? "Transaction denied by policy");
      }

      cosignRequestsTotal.inc({ status: "approved" });
      res.json({ signedXdr: result.signedXdr });
    } catch (err) {
      if (!(err instanceof ValidationError) && !(err instanceof PolicyError)) {
        cosignRequestsTotal.inc({ status: "rejected" });
      }
      throw err;
    } finally {
      timer();
    }
  }));

  app.post("/fee-bump", wrapHandler(async (req: Request, res: Response) => {
    feeBumpRequestsTotal.inc();
    const parsed = FeeBumpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const feeBumpXdr = await feeSponsorService.wrapFeeBump(parsed.data.xdr);
    res.json({ feeBumpXdr });
  }));

  app.post("/fee-bump/submit", wrapHandler(async (req: Request, res: Response) => {
    feeBumpRequestsTotal.inc();
    const parsed = FeeBumpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const result = await feeSponsorService.submit(parsed.data.xdr);
    res.json(result);
  }));

  app.get("/policy/:walletId", (req: Request, res: Response) => {
    const policy = policyEngine.getPolicy(req.params.walletId as string);
    if (!policy) {
      throw new PolicyError("No policy found", 404);
    }
    res.json(policy);
  });

  app.post("/policy", wrapHandler(async (req: Request, res: Response) => {
    const parsed = PolicyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const policy = {
      id: crypto.randomUUID(),
      walletId: parsed.data.walletId,
      rules: parsed.data.rules,
      createdAt: new Date(),
    };

    policyEngine.addPolicy(policy);
    res.json(policy);
  }));

  app.post("/wallet/create", wrapHandler(async (req: Request, res: Response) => {
    const { Wallet } = await import("@lumen/core");

    const sponsorKeypair = Keypair.fromPublicKey(
      opts.cosignerSigner.publicKey()
    );
    const wallet = new Wallet({
      client,
      sponsorKeypair,
      serverPublicKey: opts.cosignerSigner.publicKey(),
    });

    const result = await wallet.create();
    res.json({ address: result.address, publicKey: result.publicKey });
  }));

  app.use(errorHandler);

  const server = createHttpServer(app);

  server.listen(port, () => {
    logger.info({ port, network: client.config.network }, `Lumen server listening on port ${port}`);
    logger.info({ cosigner: opts.cosignerSigner.publicKey(), feePayer: opts.feePayerSigner.publicKey() }, "Signer addresses initialized");
  });

  const gracefulShutdown = (signal: string) => {
    logger.info({ signal }, `${signal} received, shutting down gracefully`);
    sponsorMonitorService.stop();

    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    const timeout = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);

    const checkInterval = setInterval(() => {
      if (activeRequests === 0) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        server.close(() => {
          logger.info("HTTP server closed");
          process.exit(0);
        });
      }
    }, 100);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  return {
    app,
    server,
    client,
    cosignerService,
    feeSponsorService,
    sponsorMonitorService,
    policyEngine,
  };
}
