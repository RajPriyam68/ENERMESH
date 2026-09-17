# EnerMesh project state

Last updated: 2026-09-17
Current sprint: **S2 Marketplace / Seller Offers** — COMPLETE
Next sprint: S3 Bids + deterministic matching

## Protocol

Before each sprint: read this file, inspect the repo, implement **only** the current sprint, integrate prior work, validate security, add UX states and tests, typecheck/lint/build, update docs, report, **stop**.

## Sprint status

| Sprint | Scope | Status |
| --- | --- | --- |
| S0 | Monorepo, design docs, Prisma schema, API/web/contract shells, CI, Docker, env | COMPLETE |
| S1 | Register/login/logout, JWT access/refresh, bcrypt, RBAC, profile, wallet nonce/signature | COMPLETE |
| S2 | Seller listings, buyer browse/filter/sort/paginate, quantity integrity | COMPLETE |
| S3 | Bids, deterministic + partial matching, DB transactions, race tests | NOT STARTED |
| S4 | Solidity listing/purchase/settle, MetaMask UX states | NOT STARTED |
| S5 | Receipt/event verification, hybrid DB sync, idempotent settlement | NOT STARTED |
| S6 | Socket.IO events, notifications | NOT STARTED |
| S7 | Advisory price recommendation, analytics dashboards | NOT STARTED |
| S8 | Provider-independent AI adapters (optional) | NOT STARTED |
| S9 | IoT adapters, EnergyHistory, simulated-data labels | NOT STARTED |
| S10 | Reports, admin, audit logs | NOT STARTED |
| S11 | Security, testing, performance | NOT STARTED |
| S12 | Docker/CI polish, production scripts, demo path | NOT STARTED |

## What exists after S2

Building on S1:

- **Listing API** — `GET /listings` public browse with filter/sort/paginate; `GET /listings/:id`; `POST /listings` (SELLER/ADMIN + verified wallet); `PATCH /listings/:id` owner/admin edit; `POST /listings/:id/cancel`; `GET /listings/mine` seller inventory including cancelled/expired.
- **Quantity integrity** — `available + sold = original` at 3 decimal places. Create sets sold = 0. Updates resize remaining energy only; sold kWh is never client-settable (`soldQuantityKwh` rejected as unknown field).
- **RBAC** — BUYER cannot create (403). Unauthenticated create is 401. Cross-seller edit is 403. Create without a verified wallet is 409 `WALLET_REQUIRED`.
- **Expiry** — Public list excludes past `availableUntil` without mutating rows mid-pagination. Get-by-id and owner edit expire ACTIVE/PARTIALLY_FILLED listings on read.
- **Web marketplace** — `/marketplace` live catalog with filters, sort, pagination, loading/empty/error states. Empty catalog stays empty; nothing is mocked.
- **Web listing detail** — `/marketplace/[id]` shows original/available/sold (actual), trade window, and owner edit link.
- **Seller offers** — `/offers`, `/offers/new`, `/offers/[id]/edit` behind `RequireRole(SELLER, ADMIN)`. Cancel confirms before POST. Wallet-required errors link to Settings.
- **Pagination payload** — list responses include `page`, `pageSize`, `total`, `totalPages` in both `data` and `meta`.

## Validation (S2)

- `npm run typecheck` — pass (shared, api, web)
- `npm run lint` — pass (shared, api, web; contracts solhint warnings unchanged)
- `npm run test` — pass (API 38, web 11, shared 12)
- `npm run build` — pass (shared, api, Next.js 15 production, contracts compile)

S2 test coverage added:

- `packages/shared/src/__tests__/quantity.test.ts` — balanced triple, oversell, mismatch, negatives, initialise sold=0, resize remaining, 3-decimal rounding.
- `apps/api/src/__tests__/listings.test.ts` — WALLET_REQUIRED, buyer 403, unauthenticated 401, create quantities, maxTrade > available 422, unknown sold field 422, filter/sort/paginate, owner update without inventing sold, cross-seller 403, cancel hides from public, 404.
- `apps/web/src/lib/__tests__/listings.test.ts` — catalog query encoding.
- `apps/web/src/lib/__tests__/datetime.test.ts` — datetime-local round-trip.

Hardhat `hardhat test` (in-process EVM) SIGBUS in this environment; compile remains the contract check.

## Explicitly out of S2

- Bids, matching persistence, MetaMask transactions, price/AI, IoT, reports
- Hardcoded marketplace volume or fabricated AI/market results (none present)
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
