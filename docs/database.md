# Database

Provider: PostgreSQL 16 via Prisma. Connection string: `DATABASE_URL` (any compatible host).

## Entities (S1 schema)

- **User** — email unique, bcrypt hash, role `BUYER | SELLER | ADMIN`, active flag, phone, bio,
  default market zone, energy interests, notification preferences, last login
- **RefreshToken** — SHA-256 hashed refresh tokens, expiry, revoke timestamp
- **Wallet** — EVM address per user/chain, primary flag, verified timestamp, single-use nonce + issue/expiry
- **Listing** — original/available/sold kWh, min/max trade size, price, zone, window, status
- **Bid** — requested/unmatched/matched kWh, max price, type, zone, window, status
- **Match** — listing+bid, matched kWh, price, status
- **Trade** — quantities, amounts, blockchain fields, unique `txHash`, unique `idempotencyKey`
- **Notification** — type, title, body, read timestamp, metadata JSON. S5 writes rows after validated listing, bid, match, trade, and wallet events and exposes them at `/notifications`.
- **EnergyHistory** — kWh samples with `ACTUAL | ESTIMATED | SIMULATED`. S8 HTTP/simulated adapters persist rows; metadata records adapter and optional energy type. S6 analytics and S7 AI insights still do not invent EnergyHistory rows; carbon savings remain ESTIMATED. S8 audit rows use `ADMIN_ACTION` with entityType `EnergyHistory`.
- **AuditLog** — action, entity, optional user, IP, metadata

## Integrity rules (enforced in S2–S5 application transactions; columns prepared in S0)

- `availableQuantityKwh >= 0`
- `soldQuantityKwh <= originalQuantityKwh`
- `soldQuantityKwh + availableQuantityKwh = originalQuantityKwh` after each fill
- Listing statuses: `ACTIVE | PARTIALLY_FILLED | SOLD_OUT | EXPIRED | CANCELLED`
- Bid statuses: `OPEN | MATCHED | PARTIALLY_MATCHED | EXPIRED | CANCELLED | COMPLETED`
- Trade `CONFIRMED` only after chain verification
- Unique `idempotencyKey` and unique `txHash` prevent duplicate settlement rows

## Indexes

Status+zone+type on listings and bids; time windows; price; user foreign keys; audit action+time.

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
