const envelope = (description: string) => ({
  description,
  content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
});

const jsonBody = (description: string) => ({
  required: true,
  content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
  description,
});

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "EnerMesh API",
    version: "0.1.0",
    description:
      "Peer-to-peer renewable energy marketplace API. Sprint 2 adds seller listings with quantity integrity and public browse/filter/sort/paginate. Matching and settlement arrive in later sprints.",
  },
  servers: [{ url: "/api/v1", description: "Versioned API" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Liveness",
        tags: ["System"],
        responses: {
          "200": envelope("Service is running"),
        },
      },
    },
    "/ready": {
      get: {
        summary: "Readiness including database ping",
        tags: ["System"],
        responses: {
          "200": envelope("Ready"),
          "503": envelope("Not ready"),
        },
      },
    },
    "/auth/register": {
      post: {
        summary: "Register a buyer or seller account",
        tags: ["Auth"],
        requestBody: jsonBody("email, password, displayName, role (BUYER|SELLER)"),
        responses: {
          "201": envelope("Account created with access and refresh tokens"),
          "409": envelope("Email already registered"),
          "422": envelope("Validation failed"),
          "429": envelope("Rate limited"),
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Authenticate and start a session",
        tags: ["Auth"],
        requestBody: jsonBody("email, password"),
        responses: {
          "200": envelope("Authenticated session"),
          "401": envelope("Invalid credentials"),
          "403": envelope("Account disabled"),
          "429": envelope("Rate limited"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Rotate a refresh token for a new session",
        tags: ["Auth"],
        requestBody: jsonBody("Optional refreshToken; falls back to the httpOnly cookie"),
        responses: {
          "200": envelope("Rotated session"),
          "401": envelope("Refresh token missing, invalid, expired or reused"),
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Revoke the current refresh session",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": envelope("Session revoked"),
          "401": envelope("Authentication required"),
        },
      },
    },
    "/auth/me": {
      get: {
        summary: "Current authenticated user",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": envelope("Current user"),
          "401": envelope("Authentication required"),
        },
      },
    },
    "/users/me": {
      get: {
        summary: "Read the current profile",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        responses: { "200": envelope("Profile"), "401": envelope("Authentication required") },
      },
      patch: {
        summary: "Update display name, phone and bio",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("displayName, phone, bio"),
        responses: {
          "200": envelope("Updated profile"),
          "401": envelope("Authentication required"),
          "422": envelope("Validation failed"),
        },
      },
    },
    "/users/me/settings": {
      patch: {
        summary: "Update market zone, energy interests and notification preferences",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("defaultMarketZone, energyTypesOfInterest, notificationEmail, notificationInApp"),
        responses: {
          "200": envelope("Updated settings"),
          "401": envelope("Authentication required"),
          "422": envelope("Validation failed"),
        },
      },
    },
    "/users/me/password": {
      post: {
        summary: "Change password and revoke all refresh sessions",
        tags: ["Profile"],
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("currentPassword, newPassword"),
        responses: {
          "200": envelope("Password changed"),
          "401": envelope("Current password incorrect"),
          "422": envelope("Validation failed"),
        },
      },
    },
    "/wallets": {
      get: {
        summary: "List linked wallets for the current user",
        tags: ["Wallet"],
        security: [{ bearerAuth: [] }],
        responses: { "200": envelope("Linked wallets"), "401": envelope("Authentication required") },
      },
    },
    "/wallets/nonce": {
      post: {
        summary: "Request a single-use verification challenge for a wallet address",
        tags: ["Wallet"],
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("address, optional chainId"),
        responses: {
          "200": envelope("Challenge message and nonce"),
          "409": envelope("Wallet already linked to another account"),
          "422": envelope("Validation failed"),
        },
      },
    },
    "/wallets/verify": {
      post: {
        summary: "Verify an EIP-191 signature and link the wallet",
        tags: ["Wallet"],
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("address, signature, nonce"),
        responses: {
          "200": envelope("Wallet verified and linked"),
          "401": envelope("Signature invalid"),
          "403": envelope("Wallet belongs to another account"),
          "409": envelope("No active challenge"),
          "410": envelope("Challenge expired"),
          "422": envelope("Nonce mismatch or validation failed"),
        },
      },
    },
    "/wallets/{address}": {
      delete: {
        summary: "Unlink a wallet from the current user",
        tags: ["Wallet"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "address",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          },
        ],
        responses: {
          "200": envelope("Wallet unlinked"),
          "404": envelope("Wallet not found for this account"),
        },
      },
    },
    "/listings": {
      get: {
        summary: "Browse public listings",
        tags: ["Listings"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "energyType", in: "query", schema: { type: "string" } },
          { name: "marketZone", in: "query", schema: { type: "string" } },
          { name: "minPrice", in: "query", schema: { type: "number" } },
          { name: "maxPrice", in: "query", schema: { type: "number" } },
          { name: "minKwh", in: "query", schema: { type: "number" } },
          { name: "sortBy", in: "query", schema: { type: "string" } },
          { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "q", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": envelope("Paginated public listings") },
      },
      post: {
        summary: "Publish a seller listing",
        tags: ["Listings"],
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody("energyType, availableKwh, min/max trade, price, location, zone, window"),
        responses: {
          "201": envelope("Listing created"),
          "401": envelope("Authentication required"),
          "403": envelope("Seller or admin role required"),
          "409": envelope("Verified wallet required or quantity conflict"),
          "422": envelope("Validation failed"),
        },
      },
    },
    "/listings/mine": {
      get: {
        summary: "List the current seller's listings including cancelled and expired",
        tags: ["Listings"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": envelope("Seller listings"),
          "401": envelope("Authentication required"),
          "403": envelope("Seller or admin role required"),
        },
      },
    },
    "/listings/{id}": {
      get: {
        summary: "Listing detail",
        tags: ["Listings"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": envelope("Listing"), "404": envelope("Not found") },
      },
      patch: {
        summary: "Update an owned listing",
        tags: ["Listings"],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: jsonBody("Partial listing fields. soldQuantityKwh cannot be set."),
        responses: {
          "200": envelope("Updated listing"),
          "403": envelope("Not the owner"),
          "404": envelope("Not found"),
          "409": envelope("Not editable"),
          "422": envelope("Validation failed"),
        },
      },
    },
    "/listings/{id}/cancel": {
      post: {
        summary: "Cancel an owned listing",
        tags: ["Listings"],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": envelope("Cancelled listing"),
          "403": envelope("Not the owner"),
          "404": envelope("Not found"),
          "409": envelope("Not cancellable"),
        },
      },
    },
    "/admin/users": {
      get: {
        summary: "List users (ADMIN only)",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: {
          "200": envelope("Paginated user list"),
          "401": envelope("Authentication required"),
          "403": envelope("Admin role required"),
        },
      },
    },
  },
};
