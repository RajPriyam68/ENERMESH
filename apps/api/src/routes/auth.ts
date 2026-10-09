import { Router } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
} from "@enermesh/shared";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../lib/cookies.js";
import { createLimiter } from "../lib/rateLimit.js";
import { refreshExpiryDate, verifyAccessToken, verifyRefreshToken } from "../lib/jwt.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import {
  getPublicUserById,
  login,
  logout,
  refresh,
  register,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service.js";

export const authRouter = Router();

const authLimiter = createLimiter({
  windowMs: 60_000,
  limit: 20,
  message: "Too many attempts. Try again shortly.",
});

const passwordResetLimiter = createLimiter({
  windowMs: 60_000,
  limit: 5,
  message: "Too many password reset attempts. Try again shortly.",
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

authRouter.post(
  "/forgot-password",
  passwordResetLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await requestPasswordReset(req.body, { ipAddress: req.ip });
    return ok(res, result);
  }),
);

authRouter.post(
  "/reset-password",
  passwordResetLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await resetPassword(req.body, { ipAddress: req.ip });
    return ok(res, result);
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
