import rateLimit from "express-rate-limit";

export interface RateLimiterOpts {
  windowMs?: number; // Time window in milliseconds (default: 60,000ms = 1 min)
  max?: number; // Max requests per window (default: 100)
}

export function rateLimiter(opts: RateLimiterOpts = {}) {
  const windowMs = opts.windowMs ?? 60 * 1000;
  const max = opts.max ?? 100;

  return rateLimit({
    windowMs,
    limit: max,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: { error: "Too Many Requests" },
  });
}
