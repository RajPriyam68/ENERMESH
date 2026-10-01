import type { Server as HttpServer } from "node:http";
import { closeSocketServer } from "../socket/index.js";
import { disconnectDatabase } from "./prisma.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function installShutdownHandlers(httpServer: HttpServer, timeoutMs = DEFAULT_TIMEOUT_MS): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`EnerMesh API shutting down (${signal})\n`);
    const failSafe = setTimeout(() => {
      process.stderr.write("EnerMesh API shutdown timed out\n");
      process.exit(1);
    }, timeoutMs);
    failSafe.unref();
    try {
      await closeSocketServer();
      await closeHttpServer(httpServer);
      await disconnectDatabase();
      process.exit(0);
    } catch (error) {
      process.stderr.write(
        `EnerMesh API shutdown error: ${error instanceof Error ? error.message : "unknown"}\n`,
      );
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
