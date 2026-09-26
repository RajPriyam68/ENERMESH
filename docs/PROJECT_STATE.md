# EnerMesh project state

Last updated: 2026-09-26
Current sprint: **S8 IoT adapters / EnergyHistory** — COMPLETE
Next sprint: S9 Reports, admin, audit logs. Hybrid on-chain listing ids remain later polish.

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
| S9 | Reports, admin, audit logs | NOT STARTED |
| S10 | Security, testing, performance | NOT STARTED |
| S11 | Docker/CI polish, production scripts, demo path | NOT STARTED |
| S12 | Hybrid DB sync / on-chain listing id persistence (deferred polish) | NOT STARTED |

## What exists after S8

Building on S7:

- **EnergyHistory** — authenticated ingest writes labelled kWh samples (`ACTUAL | ESTIMATED | SIMULATED`) onto the existing Prisma model. Empty history stays at actual 0. Samples never create listings, bids, matches, or `CONFIRMED` trades.
- **Adapters** — HTTP ingest (`POST /iot/readings`) and a simulated adapter (`POST /iot/simulate`) that always stamps `sourceLabel=SIMULATED`. MQTT env vars (`MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`) are accepted; the status payload reports `mqttAvailable: false` and does not connect a broker.
- **API** — `GET /iot/status`, `GET /iot/history`, `POST /iot/readings`, `POST /iot/simulate`. Owner-scoped reads; ADMIN may pass `userId`. Foreign history is 403. Rate limit 40/min on ingest/simulate. Audit uses existing `ADMIN_ACTION` with entityType `EnergyHistory`.
- **Web** — `/telemetry` with loading, empty, and error states. Simulated kWh is shown separately from actual kWh. Socket event `energy:updated` invalidates IoT queries.

## Validation (S8)

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npx hardhat test` in `packages/contracts`

S8 test coverage added:

- Shared: empty summary stays 0; simulated drafts are SIMULATED; ingest schema rejects unknown listing fields and negative kWh.
- API: unauthenticated 401; invalid body 422; empty history zeros; ACTUAL ingest does not change listing count or confirmed volume; stranger cannot read another user's samples (403).
- Web: `/telemetry` is protected; query encoding; `energy:updated` maps to `iot` query keys.

## Explicitly out of S8

- Reports / admin / audit log UI (S9)
- Persisting on-chain listing ids on the Listing row
- Fabricated marketplace volume or settlement results
- Treating wallet UI mined receipts as `CONFIRMED`
- MQTT broker connection or live meter polling
- Auto-creating listings from telemetry

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement tests mock JSON-RPC; they do not call a live chain.
- AI tests do not call a live LLM. They assert the unconfigured fallback path.
- IoT tests do not connect MQTT. They assert labelled HTTP/simulated EnergyHistory rows.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics are recorded from real listings, bids, matches, and confirmed trades. No fabricated numbers.
