import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_PUBLIC_URL: z.string().default("http://localhost:3001"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1).default("postgresql://enermesh:enermesh@localhost:5432/enermesh?schema=public"),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me-32"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me-32"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  CHAIN_ID: z.coerce.number().int().default(80002),
  CHAIN_NAME: z.string().default("polygon-amoy"),
  RPC_URL: z.string().default("https://rpc-amoy.polygon.technology"),
  BLOCK_EXPLORER_URL: z.string().default("https://amoy.polygonscan.com"),
  CONTRACT_ADDRESS: z.string().optional().default(""),
  SOCKET_PATH: z.string().default("/socket.io"),
  SOCKET_CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = parsed.data.DATABASE_URL;
  }
  return parsed.data;
}

export const env = loadEnv();
