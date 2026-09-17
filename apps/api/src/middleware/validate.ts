import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

declare module "express-serve-static-core" {
  interface Request {
    validatedQuery?: unknown;
  }
}

/**
 * Parses and replaces request parts with validated, coerced values.
 * Handlers must only read from req.body / req.query / req.params after this runs.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, "validatedQuery", { value: parsed, writable: true });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getValidatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
