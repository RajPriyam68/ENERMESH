import { createServer } from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createSocketServer } from "./socket/index.js";

const app = createApp();
const httpServer = createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.API_PORT, env.API_HOST, () => {
  process.stdout.write(
    `EnerMesh API listening on http://${env.API_HOST}:${env.API_PORT} (sprint S0)\n`,
  );
});
