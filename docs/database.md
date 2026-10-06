# Database

Provider: PostgreSQL 16 via Prisma. Connection string: `DATABASE_URL` (any compatible host).

## Entities (S1 schema)

- **User** — email unique, bcrypt hash, role `BUYER | SELLER | ADMIN`, active flag, phone, bio,
  default market zone, energy interests, notification preferences, last login
- **RefreshToken** — SHA-256 hashed refresh tokens, expiry, revoke timestamp
- **Wallet** — EVM address per user/chain, primary flag, verified timestamp, single-use nonce + issue/expiry
- **Listing** — original/available/sold kWh, min/max trade size, price, zone, window, status. S12 adds unique `onChainListingId`, unique `onChainTxHash`, unique `onChainIdempotencyKey`, plus contract/network/chain/block/confirmation metadata. The on-chain id is written only after verified `ListingCreated`.
- **Bid** — requested/unmatched/matched kWh, max price, type, zone, window, status
- **Match** — listing+bid, matched kWh, price, status
- **Trade** — quantities, amounts, blockchain fields, unique `txHash`, unique `idempotencyKey`, plus `onChainListingId` / `onChainTradeId` copied only after verified `EnergyPurchased` / `TradeSettled`
- **Notification** — type, title, body, read timestamp, metadata JSON. S5 writes rows after validated listing, bid, match, trade, and wallet events and exposes them at `/notifications`.
- **EnergyHistory** — kWh samples with `ACTUAL | ESTIMATED | SIMULATED`. S8 HTTP/simulated adapters persist rows; metadata records adapter and optional energy type. S6 analytics and S7 AI insights still do not invent EnergyHistory rows; carbon savings remain ESTIMATED. S8 audit rows use `ADMIN_ACTION` with entityType `EnergyHistory`.
- **AuditLog** — action, entity, optional user, IP, metadata. S9 lists rows at `GET /admin/audit-logs`. Admin disable writes `ADMIN_ACTION` with `operation=set_active`.

## Integrity rules (enforced in S2–S5 application transactions; columns prepared in S0)

- `availableQuantityKwh >= 0`
- `soldQuantityKwh <= originalQuantityKwh`
- `soldQuantityKwh + availableQuantityKwh = originalQuantityKwh` after each fill
- Migration `20261005000000_final_integrity` adds PostgreSQL CHECKs: non-negative listing quantities and `available + sold = original`
- Listing statuses: `ACTIVE | PARTIALLY_FILLED | SOLD_OUT | EXPIRED | CANCELLED`
- Bid statuses: `OPEN | MATCHED | PARTIALLY_MATCHED | EXPIRED | CANCELLED | COMPLETED`
- Trade `CONFIRMED` only after chain verification; purchase binds `EnergyPurchased.listingId` to `Listing.onChainListingId`
- Unique `idempotencyKey` and unique `txHash` prevent duplicate settlement rows
- Unique `onChainListingId` / `onChainTxHash` / `onChainIdempotencyKey` prevent duplicate listing mappings
- Listing PATCH/cancel and match confirm take serializable `FOR UPDATE` on listing (and match) rows; matched kWh moves available→sold immediately (no separate reserved column). Cancel hides remaining available kWh; sold/matched inventory stays with the match.

## Indexes

Status+zone+type on listings and bids; time windows; price; user foreign keys; audit action+time.

S10 adds `AuditLog_createdAt_idx`. Unfiltered `GET /admin/audit-logs ORDER BY createdAt DESC LIMIT 20` was a sequential top-N heapsort on 3394 live rows (EXPLAIN ANALYZE ~4.7ms) and became an index scan (~1.1ms) after the index. The existing `AuditLog_action_createdAt_idx` already covered filtered action queries (~0.15ms). EnergyHistory and telemetry reports aggregate with `groupBy` instead of loading every sample.

## Migrations

S1 ships the initial versioned migration `prisma/migrations/20260916000000_s1_auth` (full schema), already
baselined against the development database. For a fresh environment:

```bash
npm run db:generate
npm run db:deploy
```

For rapid local iteration without migration history:

```bash
npm run db:push
```

Seed the first administrator out-of-band (never through public registration):

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='ChangeMe123' npm run seed:admin
```
