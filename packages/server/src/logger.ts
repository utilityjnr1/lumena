import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";

const logLevel = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.secret",
      "*.privateKey",
      "*.secretSeed",
      "*.authorization",
      "*.token",
      "password",
      "secret",
      "secretSeed",
      "privateKey",
      "authorization",
      "token",
      "cosignerSecret",
      "feePayerSecret",
      "sponsorSecret",
    ],
    censor: "[REDACTED]",
  },
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID(),
  customAttributeKeys: {
    req: "req",
    res: "res",
    err: "err",
    responseTime: "responseTime",
  },
});
