import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_PUBLIC_URL: z.string().default("http://localhost:3001"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  /**
   * Express `trust proxy`. Leave "false" when the API is directly reachable;
   * set to the number of proxy hops (or a subnet) when deployed behind one.
   * Enabling it incorrectly lets clients spoof X-Forwarded-For and evade limits.
   */
  TRUST_PROXY: z.string().default("false"),
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
  USER_LLM_API_KEY: z.string().optional().default(""),
  USER_LLM_BASE_URL: z.string().optional().default(""),
  USER_LLM_MODEL: z.string().optional().default(""),
  USER_LLM_PROVIDER: z.string().optional().default(""),
  MQTT_URL: z.string().optional().default(""),
  MQTT_USERNAME: z.string().optional().default(""),
  MQTT_PASSWORD: z.string().optional().default(""),
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

/** Parses TRUST_PROXY without silently trusting an unparsable value. */
export function trustProxySetting(value: string): boolean | number | string {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false" || trimmed === "") return false;
  const hops = Number(trimmed);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  return trimmed;
}

export const env = loadEnv();
