import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { API_PREFIX } from "@enermesh/shared";
import { env, trustProxySetting } from "./config/env.js";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { usersRouter } from "./routes/users.js";
import { listingsRouter } from "./routes/listings.js";
import { walletsRouter } from "./routes/wallets.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", trustProxySetting(env.TRUST_PROXY));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: env.WEB_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => env.NODE_ENV === "test",
    }),
  );

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      data: {
        name: "EnerMesh API",
        prefix: API_PREFIX,
        docs: `${API_PREFIX}/docs`,
        health: `${API_PREFIX}/health`,
      },
    });
  });

  app.use(API_PREFIX, healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/users`, usersRouter);
  app.use(`${API_PREFIX}/wallets`, walletsRouter);
  app.use(`${API_PREFIX}/listings`, listingsRouter);
  app.use(`${API_PREFIX}/admin`, adminRouter);
  app.use(`${API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
