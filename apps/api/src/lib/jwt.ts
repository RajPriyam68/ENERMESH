import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: "access";
}

export interface RefreshTokenPayload extends JwtPayload {
  sub: string;
  type: "refresh";
  tokenId: string;
}

function signOptions(expiresIn: string): SignOptions {
  return { expiresIn: expiresIn as SignOptions["expiresIn"] };
}

export function signAccessToken(input: { userId: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: input.userId, email: input.email, role: input.role, type: "access" },
    env.JWT_ACCESS_SECRET,
    signOptions(env.JWT_ACCESS_EXPIRES_IN),
  );
}

export function signRefreshToken(input: { userId: string; tokenId: string }): string {
  return jwt.sign(
    { sub: input.userId, tokenId: input.tokenId, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    signOptions(env.JWT_REFRESH_EXPIRES_IN),
  );
}

function verify<T extends JwtPayload>(token: string, secret: string, type: string): T {
  const decoded = jwt.verify(token, secret) as JwtPayload;
  if (decoded.type !== type) {
    throw new Error("Unexpected token type");
  }
  return decoded as T;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verify<AccessTokenPayload>(token, env.JWT_ACCESS_SECRET, "access");
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verify<RefreshTokenPayload>(token, env.JWT_REFRESH_SECRET, "refresh");
}

export function refreshExpiryDate(token: string): Date {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (decoded?.exp) {
    return new Date(decoded.exp * 1000);
  }
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}
