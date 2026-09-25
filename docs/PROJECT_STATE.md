# EnerMesh project state

Last updated: 2026-09-24
Current sprint: **S6 advisory price recommendation + labelled analytics** — COMPLETE
Next sprint: S7 optional AI adapters (core marketplace already works without an AI key). Hybrid on-chain listing ids remain later polish.

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
| S7 | Provider-independent AI adapters (optional) | NOT STARTED |
| S8 | IoT adapters, EnergyHistory, simulated-data labels | NOT STARTED |
| S9 | Reports, admin, audit logs | NOT STARTED |
| S10 | Security, testing, performance | NOT STARTED |
| S11 | Docker/CI polish, production scripts, demo path | NOT STARTED |
| S12 | Hybrid DB sync / on-chain listing id persistence (deferred polish) | NOT STARTED |

## What exists after S6

Building on S5:

- **Price recommendation** — `GET /pricing/recommendation` is authenticated. It weights confirmed/completed trades (chain-verified) plus live ACTIVE/PARTIALLY_FILLED offers and OPEN/PARTIALLY_MATCHED bids. Response includes `recommendedPrice`, `range`, `confidence`, `reason`, `dataQuality`, `sourceLabel`, and `sampleCounts`. Empty books return `null` with `INSUFFICIENT`. Advisory only; the seller still types the listed price.
- **Analytics** — `GET /analytics` is role-scoped: buyers/sellers see their own confirmed volume, revenue, and spending; ADMIN sees platform totals. Metrics: energy traded, transaction value, average price/kWh, live supply/demand, matched/unmatched, renewable share, estimated carbon savings. Each metric carries `sourceLabel` (`ACTUAL` vs `ESTIMATED`) and `dataQuality`. Carbon savings use a documented grid factor and are never labelled actual. Empty marketplace stays at actual 0; average price is undefined, not invented.
- **Web** — offer and bid forms show the advisory panel; `/dashboard` charts use recharts with loading/empty/error states. Socket invalidation includes `pricing` and `analytics` query keys. AI is unused.

## Validation (S6)

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npx hardhat test` in `packages/contracts`

S6 test coverage added:

- Shared recommender: empty observations → null price; trades outweigh outlier asks; filters do not invent samples.
- Shared analytics: null VWAP on zero volume; carbon labelled ESTIMATED; empty sums stay ACTUAL 0.
- API: unauthenticated 401; empty book INSUFFICIENT; live listing drives advisory ask; analytics zeros; seller supply from remaining kWh; foreign confirmed volume does not leak.
- Web: `/dashboard` is protected; price query encoding; socket events invalidate analytics/pricing keys.

## Explicitly out of S6

- Optional AI adapters (S7)
- IoT / EnergyHistory adapters
- Persisting on-chain listing ids on the Listing row
- Fabricated marketplace volume or settlement results
- Treating wallet UI mined receipts as `CONFIRMED`
- Auto-applying recommended prices to listings

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement tests mock JSON-RPC; they do not call a live chain.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics are recorded from real listings, bids, matches, and confirmed trades. No fabricated numbers.
