import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, refreshTokenSchema, registerSchema } from "@enermesh/shared";
import { env } from "../config/env.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../lib/cookies.js";
import { refreshExpiryDate, verifyAccessToken, verifyRefreshToken } from "../lib/jwt.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { getPublicUserById, login, logout, refresh, register } from "../services/auth.service.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many attempts. Try again shortly." },
  },
});

authRouter.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const session = await register(req.body, { ipAddress: req.ip });
    setRefreshCookie(res, session.tokens.refreshToken, refreshExpiryDate(session.tokens.refreshToken));
    return ok(res, { user: session.user, tokens: session.tokens }, undefined, 201);
  }),
);

authRouter.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const session = await login(req.body, { ipAddress: req.ip });
    setRefreshCookie(res, session.tokens.refreshToken, refreshExpiryDate(session.tokens.refreshToken));
    return ok(res, { user: session.user, tokens: session.tokens });
  }),
);

authRouter.post(
  "/refresh",
  authLimiter,
  validate({ body: refreshTokenSchema }),
  asyncHandler(async (req, res) => {
    const token = req.body.refreshToken ?? readRefreshCookie(req);
    if (!token) {
      throw new HttpError(401, "REFRESH_TOKEN_MISSING", "No refresh token provided");
    }
    const session = await refresh(token, { ipAddress: req.ip });
    setRefreshCookie(res, session.tokens.refreshToken, refreshExpiryDate(session.tokens.refreshToken));
    return ok(res, { user: session.user, tokens: session.tokens });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const cookieToken = readRefreshCookie(req);
    let userId: string | undefined;

    const authorization = req.headers.authorization;
    const bearer =
      authorization && authorization.toLowerCase().startsWith("bearer ")
        ? authorization.slice(7).trim()
        : "";
    if (bearer) {
      try {
        userId = verifyAccessToken(bearer).sub;
      } catch {
        // Expired access tokens must not block cookie-based logout.
      }
    }

    if (!userId && cookieToken) {
      try {
        userId = verifyRefreshToken(cookieToken).sub;
      } catch {
        clearRefreshCookie(res);
        return ok(res, { revoked: 0 });
      }
    }

    if (!userId) {
      clearRefreshCookie(res);
      return ok(res, { revoked: 0 });
    }

    const result = await logout(userId, cookieToken, { ipAddress: req.ip });
    clearRefreshCookie(res);
    return ok(res, { revoked: result.revoked });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await getPublicUserById(req.user!.id);
    return ok(res, { user });
  }),
);
