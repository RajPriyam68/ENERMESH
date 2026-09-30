# EnerMesh project state

Last updated: 2026-09-29
Current sprint: **S10 Security, testing, performance** — COMPLETE
Next sprint: S11 Docker/CI polish, production scripts, demo path. Hybrid on-chain listing ids remain later polish.

## Protocol

Before each sprint: read this file, inspect the repo, implement **only** the current sprint, integrate prior work, validate security, add UX states and tests, typecheck/lint/build, update docs, report, **stop**.

## Sprint status

| Sprint | Scope | Status |
| --- | --- | --- |
| S0 | Monorepo, design docs, Prisma schema, API/web/contract shells, CI, Docker, env | COMPLETE |
| S1 | Register/login/logout, JWT access/refresh, bcrypt, RBAC, profile, wallet nonce/signature | COMPLETE |
| S2 | Seller listings, buyer browse/filter/sort/paginate, quantity integrity | COMPLETE |
| S3 | Bids, deterministic + partial matching, DB transactions, race tests | COMPLETE |
| S4 | Solidity listing/purchase/settle, MetaMask UX, backend receipt/event verification | COMPLETE |
| S5 | Socket.IO events after validated writes, in-app notifications, REST-backed UI refresh | COMPLETE |
| S6 | Advisory price recommendation, labelled analytics dashboards | COMPLETE |
| S7 | Provider-independent AI adapters (optional) | COMPLETE |
| S8 | IoT adapters, EnergyHistory, simulated-data labels | COMPLETE |
| S9 | Reports, admin, audit logs | COMPLETE |
| S10 | Security, testing, performance | COMPLETE |
| S11 | Docker/CI polish, production scripts, demo path | NOT STARTED |
| S12 | Hybrid DB sync / on-chain listing id persistence (deferred polish) | NOT STARTED |

## What exists after S10

Building on S9:

- **Headers / CORS / cookies** — Helmet now sets `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. CORS reflects only origins from `WEB_ORIGIN` (never `*`). Refresh cookie remains httpOnly, path `/api/v1/auth`, `SameSite=Lax`, `Secure` in production.
- **Secrets** — Production refuses default or short JWT secrets, identical access/refresh secrets, and wildcard `WEB_ORIGIN`.
- **Rate limits** — Global 120/min/IP. Auth 20/min. Wallet nonce/verify 20/min. Admin and reports 40/min. AI 20/min and IoT ingest 40/min unchanged. Limiters still skip when `NODE_ENV=test`; limiter behaviour is covered by a dedicated test that does not skip.
- **Validation / leakage** — Wallet unlink addresses are Zod-validated. Invalid JSON is `400 INVALID_JSON`. Unexpected errors always return a generic `INTERNAL_ERROR` message.
- **Admin** — Last-admin disable is checked inside a SERIALIZABLE transaction.
- **Performance (measured)** — Unfiltered `GET /admin/audit-logs ORDER BY createdAt DESC LIMIT 20` was a sequential top-N heapsort on 3394 rows (~4.7ms). After `AuditLog_createdAt_idx` it is an index scan (~1.1ms). EnergyHistory and telemetry reports now aggregate with `groupBy` instead of loading every sample.
- **Web** — Next.js sends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a restrictive `Permissions-Policy`. API client parse failures become `INVALID_RESPONSE` instead of throwing raw JSON errors.

## Validation (S10)

- `npm run typecheck` — pass
- `npm run lint` — pass (pre-existing Solidity gas-custom-errors warnings only)
- `npm run test` — pass (API 102, web 39, shared 44)
- `npm run build` — pass
- `npx hardhat test` in `packages/contracts` — 12 passing

S10 test coverage added:

- Shared: wallet address param schema.
- API: security headers; unlisted CORS origin; invalid JSON; generic 500; limiter 429; production secret rejection; ADMIN register 422; last-admin 409; disabled-admin 403; malformed wallet unlink 422; refresh cookie flags.
- Web: extra open-redirect case.

## Explicitly out of S10

- Docker/CI polish and demo path (S11)
- Persisting on-chain listing ids on the Listing row (S12)
- Fabricated marketplace volume or settlement results
- Treating wallet UI mined receipts as `CONFIRMED`
- Promoting users to ADMIN through the public API

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement tests mock JSON-RPC; they do not call a live chain.
- AI tests do not call a live LLM. They assert the unconfigured fallback path.
- IoT tests do not connect MQTT. They assert labelled HTTP/simulated EnergyHistory rows.
- Rate limiters skip when `NODE_ENV === "test"` so S0–S9 HTTP tests stay deterministic. Limiter 429 is asserted in `security.test.ts` with `skip: () => false`.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics are recorded from real listings, bids, matches, and confirmed trades. No fabricated numbers.
