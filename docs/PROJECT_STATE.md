# EnerMesh project state

Last updated: 2026-09-25
Current sprint: **S7 provider-independent AI advisory adapters** — COMPLETE
Next sprint: S8 IoT adapters / EnergyHistory. Hybrid on-chain listing ids remain later polish.

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
| S8 | IoT adapters, EnergyHistory, simulated-data labels | NOT STARTED |
| S9 | Reports, admin, audit logs | NOT STARTED |
| S10 | Security, testing, performance | NOT STARTED |
| S11 | Docker/CI polish, production scripts, demo path | NOT STARTED |
| S12 | Hybrid DB sync / on-chain listing id persistence (deferred polish) | NOT STARTED |

## What exists after S7

Building on S6:

- **AI advisory** — `GET /ai/status` and `POST /ai/insights` are authenticated. Insights explain labelled S6 price recommendations, analytics, listing remaining kWh, and owned bids. Output is always `advisory: true` and `actionsEnabled: false`.
- **Provider-agnostic adapter** — `USER_LLM_PROVIDER` / `USER_LLM_BASE_URL` / `USER_LLM_MODEL` / `USER_LLM_API_KEY` on the API only. Supports OpenAI, Gemini, and OpenAI-compatible/local endpoints. Missing or invalid configuration returns a deterministic S6 fallback. Keys never reach the frontend or `/ai/status`.
- **Prompt isolation** — marketplace fields and the user question are sanitized and wrapped as untrusted data. Injection phrases are redacted. Model JSON is schema-validated; malformed replies fall back.
- **Web** — `/advisor` plus advisor panels on dashboard, listing detail, and bid detail. Loading, error, and unconfigured states are explicit. Charts and settlement UX are unchanged.

## Validation (S7)

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npx hardhat test` in `packages/contracts`

S7 test coverage added:

- Shared: injection sanitization; empty-book fallback does not invent volume; model JSON parse; advisory flags forced.
- API: unauthenticated 401; invalid body 422; unconfigured status without secrets; fallback zeros; live listing remaining kWh; stranger cannot read another buyer's bid; unknown listing 404.
- Web: `/advisor` is protected; request builder omits execute flags.

## Explicitly out of S7

- IoT / EnergyHistory adapters (S8)
- Persisting on-chain listing ids on the Listing row
- Fabricated marketplace volume or settlement results
- Treating wallet UI mined receipts as `CONFIRMED`
- Auto-applying recommended or AI prices to listings
- AI executing trades, wallet actions, or blockchain transactions

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement tests mock JSON-RPC; they do not call a live chain.
- AI tests do not call a live LLM. They assert the unconfigured fallback path.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics are recorded from real listings, bids, matches, and confirmed trades. No fabricated numbers.
