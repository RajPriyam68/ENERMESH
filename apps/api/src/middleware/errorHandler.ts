import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { fail } from "../lib/response.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  return fail(res, "NOT_FOUND", "Resource not found", 404);
}

/**
 * Schemas are authored in @enermesh/shared, which may resolve a different zod
 * instance than this app. instanceof alone is not reliable across workspace
 * package boundaries, so fall back to the stable ZodError shape.
 */
function isZodError(err: unknown): err is ZodError {
  if (err instanceof ZodError) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    typeof (err as { flatten?: unknown }).flatten === "function"
  );
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  void next;
  if (isZodError(err)) {
    return fail(res, "VALIDATION_ERROR", "Request validation failed", 422, err.flatten());
  }
  if (err instanceof HttpError) {
    return fail(res, err.code, err.message, err.status, err.details);
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (process.env.NODE_ENV !== "production") {
    return fail(res, "INTERNAL_ERROR", message, 500);
  }
  return fail(res, "INTERNAL_ERROR", "An unexpected error occurred", 500);
}
