import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: env.SOCKET_PATH,
    cors: {
      origin: env.SOCKET_CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.emit("system:hello", {
      service: "enermesh",
      sprint: "S0",
      message: "Realtime channel ready. Privileged events are server-emitted only.",
    });
  });

  return io;
}
