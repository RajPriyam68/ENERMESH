import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: env.SOCKET_PATH,
    cors: {
      origin: env.SOCKET_CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    },
  });

  /**
   * Realtime channels are per-user. The handshake token must be a valid access
   * token for an active account, otherwise the connection is rejected outright.
   */
  io.use(async (socket, next) => {
    const raw =
      (socket.handshake.auth?.token as string | undefined) ??
      (typeof socket.handshake.headers.authorization === "string"
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
        : undefined);

    if (!raw) {
      return next(new Error("UNAUTHENTICATED"));
    }

    try {
      const payload = verifyAccessToken(raw);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, isActive: true },
      });
      if (!user || !user.isActive) {
        return next(new Error("UNAUTHENTICATED"));
      }
      socket.data.user = { id: user.id, email: user.email, role: user.role };
      socket.join(`user:${user.id}`);
      return next();
    } catch {
      return next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string; role: string };
    socket.emit("system:hello", {
      service: "enermesh",
      sprint: "S1",
      userId: user.id,
      message: "Realtime channel ready. Privileged events are server-emitted only.",
    });
  });

  return io;
}
