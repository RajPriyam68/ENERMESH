# EnerMesh project state

Last updated: 2026-09-21
Current sprint: **S4 Solidity + MetaMask + Receipt Verification** — COMPLETE (final integration check)
Next sprint: S5 remaining hybrid/realtime polish (Socket.IO settlement events land in S6)

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
| S5 | Further hybrid DB sync / settlement polish | NOT STARTED |
| S6 | Socket.IO events, notifications | NOT STARTED |
| S7 | Advisory price recommendation, analytics dashboards | NOT STARTED |
| S8 | Provider-independent AI adapters (optional) | NOT STARTED |
| S9 | IoT adapters, EnergyHistory, simulated-data labels | NOT STARTED |
| S10 | Reports, admin, audit logs | NOT STARTED |
| S11 | Security, testing, performance | NOT STARTED |
| S12 | Docker/CI polish, production scripts, demo path | NOT STARTED |

## What exists after S4

Building on S3:

- **Solidity marketplace** — `createListing`, `updateListing`, `cancelListing`, `purchaseEnergy`, `settleTrade` on `EnerMeshMarketplace`. OpenZeppelin AccessControl, Pausable, ReentrancyGuard. Seller payout via `Address.sendValue`.
- **MetaMask UX** — connect, Amoy detect/add/switch, Review Trade (`purchaseEnergy` / `settleTrade`), seller `createListing`. Phases: connecting / wrong_network / awaiting_signature / pending / mined / failed / rejected. Wallet mined receipt maps to `PENDING`, never `CONFIRMED`.
- **Trade report API** — `POST /trades/report` (purchase | settle | reject). Backend reads `RPC_URL`, checks `CHAIN_ID`, configured `CONTRACT_ADDRESS`, sender wallets, `EnergyPurchased` / `TradeSettled`, quantity and payment. Idempotent on `txHash` and `idempotencyKey`. Missing receipt stays `PENDING`.
- **Match status** — purchase pending/confirmed moves the match to `SETTLEMENT_PENDING`; verified `settleTrade` moves it to `SETTLED`. Reverts and invalid events mark the trade `FAILED` without confirming.
- **Web** — Review Trade submits the hash as soon as MetaMask returns it, again after the wallet receipt, and reports `reject` on user denial. API verification status is shown separately from wallet UI.

## Validation (S4)

- `npm run typecheck` — pass (shared, api, web)
- `npm run lint` — pass (shared, api, web; contracts solhint warnings unchanged)
- `npm run test` — pass
- `npm run build` — pass (shared, api, Next.js 15 production, contracts compile)
- `npx hardhat test` in `packages/contracts` — 12 passing

S4 test coverage added:

- `packages/contracts/test/EnerMeshMarketplace.js` — listing/purchase/settle, pause, self-trade, oversell, incorrect payment, duplicate settle.
- `apps/web/src/lib/__tests__/marketplace.test.ts` — encoding, wallet confirmation policy, explorer URLs.
- `apps/api/src/__tests__/marketplace-events.test.ts` — EnergyPurchased / TradeSettled parsing from the configured contract only.
- `apps/api/src/__tests__/settlement.test.ts` — unauthenticated 401, wallet reject, retry after reject, pending without receipt, confirm after receipt, idempotent confirm, duplicate txHash, wrong wallet, seller 403, wrong network, missing event, reverted receipt, cancelled listing, expired listing window, settle after purchase.

S4 final integration check (2026-09-21) closed two gaps without starting S5:

- Expired listing/bid windows now return `STALE_TRADE` on purchase (cancelled/expired listings still block purchase only; a confirmed purchase can still settle).
- Review Trade locks a second `purchaseEnergy` / `settleTrade` after pending/confirmed/completed API status; wallet reject rotates the local idempotency key so a later purchase is not stuck on `REJECTED`.

## Explicitly out of S4

- Socket.IO trade events (S6)
- Persisting on-chain listing ids on the Listing row (still browser `localStorage` until a later hybrid pass)
- Price/AI, IoT, reports
- Hardcoded marketplace volume or fabricated settlement results (none present)
- Private keys in env templates, repository, or logs

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- This workspace had a damaged `npm install`; several packages were restored by hand
  (`react-hook-form`, `socket.io-client`, `confbox`, `commander@10`, and others). Re-running
  `npm install` may damage them again, so prefer targeted restores.
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement tests mock JSON-RPC; they do not call a live chain.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics will be recorded from real system behaviour starting when matching and settlement exist. No fabricated numbers.
