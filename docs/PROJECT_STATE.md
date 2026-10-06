# EnerMesh project state

Last updated: 2026-10-06
Current sprint: **S12 Hybrid DB sync / on-chain listing id persistence** — COMPLETE
Post-S12: **final hardening pass** — COMPLETE
Post-hardening: **P0/P1 verification** — COMPLETE (2026-10-06).
Next sprint: none scheduled. Do not start a new sprint unless asked.

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
| S12 | Hybrid DB sync / on-chain listing id persistence | COMPLETE |

## What exists after S12

Building on S11 (Docker, production scripts, CI):

- **Listing mapping** — Unique `onChainListingId`, `onChainTxHash`, and `onChainIdempotencyKey` on `Listing`, plus contract/network/chain/block/confirmation metadata.
- **Verification** — `POST /listings/:id/on-chain` reuses S4 RPC helpers. CONFIRMED listing ids come only from a successful receipt and `ListingCreated` on the configured contract. Quantity, price, seller wallet, and `externalId` (listing UUID) must match. Missing receipt is PENDING with no id. Revert/invalid event is FAILED. Wallet reject is REJECTED.
- **API surface** — ListingPublic and MatchPublic expose the persisted id and explorer URL when confirmed. RBAC: seller owner or ADMIN.
- **Web** — Publish listing reports the txHash to the API. UI shows persisted id, explorer, pending, and error. Purchase uses the API id when present. Wallet mined receipts stay PENDING.

## Post-S12 hardening

Integrity and fail-closed settlement, without a new sprint:

- Purchase/settle bind `EnergyPurchased.listingId` to `Listing.onChainListingId` and persist `Trade.onChainTradeId`.
- Listing PATCH/cancel and match confirm run under serializable `FOR UPDATE`.
- Min-trade remainder may fill the last lot; equal-price ties use createdAt then listing id.
- Contract: unique non-zero `externalId`, escrow blocks cancel, operator `refundTrade` emits `TradeRefunded`.
- Refresh reuse revokes the user token family; JWT sign/verify is HS256-only.
- Wallet nonce consume is atomic; IoT ingest defaults to ESTIMATED; quantity identity CHECK on Listing.
- Verification 2026-10-06: typecheck/lint/test/build/hardhat passed. Remaining P2: no live socket kick on logout/disable; bid cancel is not row-locked; analytics snapshot is unpaginated; DB cancel does not call on-chain `cancelListing`.

## Validation (S12 + hardening)

- `npm run typecheck` — passed
- `npm run lint` — passed (existing solhint warnings in contracts)
- `npm run test` — passed (API 125, web 42, shared 49)
- `npx hardhat test` in `packages/contracts` — 15 passing
- Docker CLI is not installed in this workspace, so image builds were not run here.

S12 tests added:

- API: persist verified ListingCreated id; idempotent confirm; duplicate id/tx; wrong chain/contract/wallet; missing event; other listing; revert; concurrent confirm; ownership
- API: ListingCreated event parsing only from the configured contract
- S4 settlement tests remain

## Explicitly out of S12

- Solidity changes (ListingCreated already emits listingId)
- Treating wallet UI mined receipts as CONFIRMED
- Fabricated marketplace volume or settlement results
- Real production deployment to Vercel/Render/Railway/AWS/Azure/GCP/Fly.io

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement and listing-chain tests mock JSON-RPC; they do not call a live chain.
- AI tests do not call a live LLM. They assert the unconfigured fallback path.
- IoT tests do not connect MQTT. They assert labelled HTTP/simulated EnergyHistory rows.
- Rate limiters skip when `NODE_ENV === "test"` so S0–S9 HTTP tests stay deterministic. Limiter 429 is asserted in `security.test.ts` with `skip: () => false`.
- `packages/contracts` `npm test` still compiles; Hardhat Mocha tests run via `npm run contracts:test` / `npx hardhat test`.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics are recorded from real listings, bids, matches, and confirmed trades. No fabricated numbers.
