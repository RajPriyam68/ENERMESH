# EnerMesh project state

Last updated: 2026-09-17
Current sprint: **S3 Bids + Deterministic Matching** — COMPLETE
Next sprint: S4 Solidity listing/purchase/settle + MetaMask UX

## Protocol

Before each sprint: read this file, inspect the repo, implement **only** the current sprint, integrate prior work, validate security, add UX states and tests, typecheck/lint/build, update docs, report, **stop**.

## Sprint status

| Sprint | Scope | Status |
| --- | --- | --- |
| S0 | Monorepo, design docs, Prisma schema, API/web/contract shells, CI, Docker, env | COMPLETE |
| S1 | Register/login/logout, JWT access/refresh, bcrypt, RBAC, profile, wallet nonce/signature | COMPLETE |
| S2 | Seller listings, buyer browse/filter/sort/paginate, quantity integrity | COMPLETE |
| S3 | Bids, deterministic + partial matching, DB transactions, race tests | COMPLETE |
| S4 | Solidity listing/purchase/settle, MetaMask UX states | NOT STARTED |
| S5 | Receipt/event verification, hybrid DB sync, idempotent settlement | NOT STARTED |
| S6 | Socket.IO events, notifications | NOT STARTED |
| S7 | Advisory price recommendation, analytics dashboards | NOT STARTED |
| S8 | Provider-independent AI adapters (optional) | NOT STARTED |
| S9 | IoT adapters, EnergyHistory, simulated-data labels | NOT STARTED |
| S10 | Reports, admin, audit logs | NOT STARTED |
| S11 | Security, testing, performance | NOT STARTED |
| S12 | Docker/CI polish, production scripts, demo path | NOT STARTED |

## What exists after S3

Building on S2:

- **Bid API** — `POST /bids` (BUYER/ADMIN) creates a bid and immediately runs matching. Optional `listingId` targets one offer; omitted bids are open-market. `GET /bids`, `GET /bids/:id`, `POST /bids/:id/cancel`.
- **Match API** — `GET /matches` and `GET /matches/:id` for participants (buyer or seller of the fill). Status is `PROPOSED`; settlement is S4+.
- **Deterministic matcher** — cheapest compatible listing first (price → energy type → zone → earliest created). Partial fills are mandatory. Self-trade, price above max, type/zone mismatch, and non-overlapping windows are rejected.
- **Quantity integrity** — listing `available + sold = original` and bid `unmatched + matched = requested` after every fill. Oversell is blocked inside serializable transactions with row locks and retry on serialization failure.
- **RBAC** — seller cannot place bids (403). Other buyers cannot read a bid (403). Unauthenticated create is 401.
- **Web** — listing detail hosts a live bid form; `/bids`, `/bids/new`, `/bids/[id]`, `/matches` with loading/empty/error states. Empty bid/match lists stay empty.

## Validation (S3)

- `npm run typecheck` — pass (shared, api, web)
- `npm run lint` — pass (shared, api, web; contracts solhint warnings unchanged)
- `npm run test` — pass (API 44, web 11, shared 16)
- `npm run build` — pass (shared, api, Next.js 15 production, contracts compile)

S3 test coverage added:

- `packages/shared/src/__tests__/matching.test.ts` — cheapest-first multi-listing fill; min-trade rejection.
- `packages/shared/src/__tests__/quantity.test.ts` — `applyFill` / `applyBidFill` integrity.
- `apps/api/src/__tests__/matching.test.ts` — 100 vs 30 partial fill, concurrent 40 kWh race without oversell, cheaper listing preference, seller 403, self-trade blocked by role, incompatible type stays unmatched, past window 422, bid privacy 403, cancel remaining demand.

Hardhat `hardhat test` (in-process EVM) SIGBUS in this environment; compile remains the contract check.

## Explicitly out of S3

- MetaMask transactions, Solidity purchase/settle, receipt verification
- Socket.IO match events, price/AI, IoT, reports
- Hardcoded marketplace volume or fabricated match results (none present)
- Private keys in env templates or repository

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- This workspace had a damaged `npm install`; several packages were restored by hand
  (`react-hook-form`, `socket.io-client`, `confbox`, `commander@10`, and others). Re-running
  `npm install` may damage them again, so prefer targeted restores.
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics will be recorded from real system behaviour starting when matching and settlement exist. No fabricated numbers.
