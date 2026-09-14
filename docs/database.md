# Database

Provider: PostgreSQL 16 via Prisma. Connection string: `DATABASE_URL` (any compatible host).

## Entities (S0 schema)

- **User** — email unique, bcrypt hash, role `BUYER | SELLER | ADMIN`, active flag
- **RefreshToken** — hashed refresh tokens, expiry, revoke timestamp
- **Wallet** — verified EVM address per user/chain, primary flag
- **Listing** — original/available/sold kWh, min/max trade size, price, zone, window, status
- **Bid** — requested/unmatched/matched kWh, max price, type, zone, window, status
- **Match** — listing+bid, matched kWh, price, status
- **Trade** — quantities, amounts, blockchain fields, unique `txHash`, unique `idempotencyKey`
- **Notification** — type, title, body, read timestamp, metadata JSON
- **EnergyHistory** — kWh samples with `ACTUAL | ESTIMATED | SIMULATED`
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

S0 ships the Prisma schema. Apply when Postgres is available:

```bash
npm run db:generate
npm run db:push
```

Use `prisma migrate` in environments that require versioned SQL.
