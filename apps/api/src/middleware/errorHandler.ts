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

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  void next;
  if (err instanceof ZodError) {
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
