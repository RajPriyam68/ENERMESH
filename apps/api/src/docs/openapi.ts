export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "EnerMesh API",
    version: "0.1.0",
    description:
      "Peer-to-peer renewable energy marketplace API. Sprint 0 exposes health, readiness, and OpenAPI. Auth, marketplace, matching, and settlement arrive in later sprints.",
  },
  servers: [{ url: "/api/v1", description: "Versioned API" }],
  paths: {
    "/health": {
      get: {
        summary: "Liveness",
        tags: ["System"],
        responses: {
          "200": { description: "Service is running" },
        },
      },
    },
    "/ready": {
      get: {
        summary: "Readiness including database ping",
        tags: ["System"],
        responses: {
          "200": { description: "Ready" },
          "503": { description: "Not ready" },
        },
      },
    },
  },
};
