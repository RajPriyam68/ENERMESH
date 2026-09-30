import rateLimit, { type Options, type RateLimitRequestHandler } from "express-rate-limit";
import { env } from "../config/env.js";

export interface LimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
  skip?: Options["skip"];
}

export function createLimiter(options: LimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip ?? (() => env.NODE_ENV === "test"),
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: options.message },
    },
  });
}
