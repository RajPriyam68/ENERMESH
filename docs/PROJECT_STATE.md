# EnerMesh project state

Last updated: 2026-09-30
Current sprint: **S11 Docker/CI polish, production scripts, demo path** — COMPLETE
Next sprint: S12 Hybrid DB sync / on-chain listing id persistence (deferred polish). Do not start S12 in this sprint.

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
| S11 | Docker/CI polish, production scripts, demo path | COMPLETE |
| S12 | Hybrid DB sync / on-chain listing id persistence (deferred polish) | NOT STARTED |

## What exists after S11

Building on S10 (headers, CORS, cookies, rate limits, validation, generic 500s, audit index):

- **Docker** — Node 22 Alpine multi-stage images. `npm ci`. Shared package built before API/web. Non-root `enermesh`. `.dockerignore` excludes `.env` and secrets. API HEALTHCHECK uses `/api/v1/ready`. Web HEALTHCHECK hits `/`. Compose: Postgres 16, API, web; API entrypoint runs `prisma migrate deploy` then `node dist/index.js`.
- **Production scripts** — `scripts/start-api-prod.sh` (migrate + start), `scripts/start-web-prod.sh`. Workspace `start:api`, `start:web`, `start:prod:api`, `db:deploy` via Prisma in `apps/api`.
- **Shutdown** — API handles SIGTERM/SIGINT: close Socket.IO, HTTP, Prisma.
- **CI** — Node 22, npm cache, shared build, `db:deploy` against Postgres 16, typecheck, lint, tests, production build, Hardhat tests (`npm run contracts:test`), Compose config, Docker build-push with `push: false`. No deploy credentials.
- **Socket URL** — `resolveSocketUrl` keeps same-origin rewrites unless `NEXT_PUBLIC_SOCKET_URL` is an absolute http(s) origin.
- **Env** — `.env.example` documents required/optional production variables including Compose Postgres, `RUN_MIGRATIONS`, `API_INTERNAL_URL`, optional `DEPLOYER_PRIVATE_KEY` (never committed).

## Validation (S11)

- `npm run typecheck` — pass
- `npm run lint` — pass (pre-existing Solidity `gas-custom-errors` warnings only)
- `npm run test` — pass (API 105, web 41, shared 44)
- `npm run build` — pass
- `npx hardhat test` in `packages/contracts` — 12 passing
- Docker CLI is not installed in this workspace, so image builds were not run here. CI is configured to run `docker compose config` and `docker/build-push-action` with `push: false`.

S11 tests added:

- API: readiness `/ready` (200 connected or 503 `NOT_READY`); HTTP shutdown close + idempotent close
- Web: `resolveSocketUrl` same-origin vs absolute http(s)
- Production secrets: empty `WEB_ORIGIN` rejected

## Explicitly out of S11

- Persisting on-chain listing ids on the Listing row (S12)
- Real production deployment to Vercel/Render/Railway/AWS/Azure/GCP/Fly.io
- Fabricated marketplace volume or settlement results
- Treating wallet UI mined receipts as `CONFIRMED`

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
- `packages/contracts` `npm test` still compiles; Hardhat Mocha tests run via `npm run contracts:test` / `npx hardhat test`.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics are recorded from real listings, bids, matches, and confirmed trades. No fabricated numbers.
