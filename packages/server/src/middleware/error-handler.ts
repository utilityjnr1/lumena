import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Patterns that may leak internal details (raw Stellar transaction hashes,
 * stack traces, etc.) into API responses. These are stripped from the
 * client-facing message in production.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  // Raw Stellar transaction hashes (64 hex chars)
  /\b[a-fA-F0-9]{64}\b/g,
  // Stellar account / contract identifiers (G.../C... 56 chars)
  /\b[GC][A-Z2-7]{55}\b/g,
  // Stack trace frames
  /\n?\s*at\s+[^\n]+/g,
];

/**
 * Remove internal details from an error message before it is returned to an
 * API client. Internal details are preserved in structured logs instead.
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted]');
  }
  return sanitized.trim();
}

/**
 * Build the client-facing error payload. In production we never expose stack
 * traces or internal details; in other environments we keep them for debugging.
 */
export function buildErrorResponse(
  err: Error,
  statusCode: number,
  isProduction: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    error: isProduction ? sanitizeErrorMessage(err.message) : err.message,
    statusCode,
  };

  if (!isProduction && err.stack) {
    payload.stack = err.stack;
  }

  return payload;
}

/**
 * Express error handler. Logs full internal details via structured Pino
 * logging and returns a sanitized response to the client.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Structured logging keeps the full internal details server-side only.
  logger.error(
    {
      err,
      statusCode,
      method: req.method,
      path: req.path,
    },
    'Request error',
  );

  res.status(statusCode).json(buildErrorResponse(err, statusCode, isProduction));
}
