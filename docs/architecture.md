# Architecture

## Purpose

EnerMesh connects energy **sellers** (prosumers with surplus kWh) and **buyers**. The API owns matching, quantity integrity, and settlement verification. The chain stores a minimal, independently verifiable record of finalized trades.

## Runtime topology

- `apps/web` — Next.js 15 App Router, React 19, Tailwind. Preview entry on port 3000. Rewrites `/api/*` to the API so a single public port is sufficient.
- `apps/api` — Express on port 3001. JWT (S1+), Prisma/PostgreSQL, matching (S3+), Socket.IO.
- `packages/shared` — enums, Zod contracts, matching helpers used by API tests and (later) UI forms.
- `packages/contracts` — Solidity marketplace; network/RPC/address are environment-configured.

## Request flow

1. Browser talks only to the web origin (or same-origin `/api` proxy).
2. API validates input with Zod, enforces RBAC (S1+), writes operational data to PostgreSQL.
3. Matching runs in the API inside database transactions (S3).
  4. Buyer/seller review a match, then MetaMask proposes a contract call (S4).
  5. API never marks a trade `CONFIRMED` until it verifies receipt, event, and contract state (`POST /trades/report`).
  6. Socket.IO emits server-authored events only after validated writes (S5). Clients cannot emit privileged state. REST remains the source of truth.

## Trust boundaries

| Boundary | Rule |
| --- | --- |
| Browser | Untrusted. Validation, prices, quantities, and roles are re-checked on the API. |
| API | Trusted for marketplace state. Holds JWT secrets. Never holds wallet private keys. |
| PostgreSQL | System of record for listings, bids, matches, notifications, audit. |
| Chain | Evidence of settlement: IDs, wallets, quantity, price, timestamp. No PII. |
| AI / IoT | Advisory or labelled telemetry. Cannot approve trades or change prices. |

## Hybrid data split

PostgreSQL stores dynamic marketplace data and blockchain metadata (`txHash`, `blockNumber`, confirmation status).

On-chain fields: trade/listing ID, seller/buyer wallets, quantity, price, timestamp. The API copies verified `txHash`, `blockNumber`, contract, and network onto `Trade`.

## Environments

All hosts are selected via environment variables. Source does not import vendor SDKs for a single cloud. See `docs/deployment.md`.
