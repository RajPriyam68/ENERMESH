import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "./errorHandler.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Verifies the access token and reloads the user from the database so role or
 * active-status changes take effect immediately (no stale-privilege tokens).
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearer(req);
    if (!token) {
      throw new HttpError(401, "UNAUTHENTICATED", "Authentication required");
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new HttpError(401, "INVALID_TOKEN", "Access token is invalid or expired");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, displayName: true, role: true, isActive: true },
    });

    if (!user) {
      throw new HttpError(401, "USER_NOT_FOUND", "Account no longer exists");
    }
    if (!user.isActive) {
      throw new HttpError(403, "ACCOUNT_DISABLED", "Account is disabled");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Authentication required"));
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action"));
    }
    return next();
  };
}
