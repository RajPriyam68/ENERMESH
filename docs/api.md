# API

Base path: `/api/v1`. JSON envelope:

```json
{ "success": true, "data": {}, "meta": {} }
```

Errors:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

## Endpoints

### System (S0)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | public | Liveness |
| GET | `/api/v1/ready` | public | Readiness + database ping |
| GET | `/api/v1/docs` | public | Swagger UI |
| GET | `/api/v1/docs.json` | public | OpenAPI document |

### Auth (S1)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | public | Create a BUYER or SELLER account |
| POST | `/api/v1/auth/login` | public | Authenticate and start a session |
| POST | `/api/v1/auth/refresh` | refresh token | Rotate the refresh token for a new session |
| POST | `/api/v1/auth/logout` | access token | Revoke the current (or all) refresh tokens |
| GET | `/api/v1/auth/me` | access token | Current authenticated user |

### Profile and settings (S1)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/users/me` | access token | Read the current profile |
| PATCH | `/api/v1/users/me` | access token | Update displayName, phone, bio |
| PATCH | `/api/v1/users/me/settings` | access token | Update market zone, energy interests, notification prefs |
| POST | `/api/v1/users/me/password` | access token | Change password and revoke all refresh sessions |

### Wallet verification (S1)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/wallets` | access token | List linked wallets |
| POST | `/api/v1/wallets/nonce` | access token | Issue a single-use EIP-191 challenge |
| POST | `/api/v1/wallets/verify` | access token | Verify a signature and link the address |
| DELETE | `/api/v1/wallets/:address` | access token | Unlink a wallet |

### Admin (S1)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/users` | ADMIN | Paginated user list |

## Session model

- **Access token** — JWT, 15 min, held in memory by the web client, sent as `Authorization: Bearer`.
- **Refresh token** — JWT, 7 days, stored in the `RefreshToken` table as a SHA-256 hash and delivered as an
  httpOnly, same-site, path-scoped cookie (`/api/v1/auth`). Rotation is atomic: a token is revoked on first
  use, and reuse is rejected with 401.
- Passwords are hashed with bcrypt (`BCRYPT_ROUNDS`, default 12). Only the hash is stored.
- `authenticate` reloads the user on every request, so role changes and deactivation take effect immediately.

## Wallet challenge

`POST /wallets/nonce` returns a plain-text message and a nonce valid for 5 minutes. The client signs it
verbatim with `personal_sign`. The nonce is single-use: it is consumed on the first verify attempt whether or
not the signature is valid. Challenges bind the address, chain ID, nonce and issue timestamp.

Admin accounts are never self-assigned. Provision the first one out-of-band:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='ChangeMe123' npm run seed:admin
```

### Listings (S2)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/listings` | public | Browse ACTIVE/PARTIALLY_FILLED listings; filter, sort, paginate |
| GET | `/api/v1/listings/mine` | SELLER/ADMIN | Seller inventory including cancelled and expired |
| GET | `/api/v1/listings/:id` | public | Listing detail; expires the row on read if the window has passed |
| POST | `/api/v1/listings` | SELLER/ADMIN + verified wallet | Publish an offer; sold kWh is always 0 |
| PATCH | `/api/v1/listings/:id` | owner or ADMIN | Update remaining kWh and offer fields; sold kWh cannot be set |
| POST | `/api/v1/listings/:id/cancel` | owner or ADMIN | Cancel an ACTIVE or PARTIALLY_FILLED listing |

List responses include `listings`, `page`, `pageSize`, `total`, `totalPages` in `data` and the same pagination fields in `meta`.

Create without a verified wallet returns 409 `WALLET_REQUIRED`. Unknown fields such as `soldQuantityKwh` return 422. Quantity integrity failures return 409 `QUANTITY_INTEGRITY`.

### Bids (S3)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/bids` | BUYER/ADMIN | List own bids; filter, sort, paginate |
| GET | `/api/v1/bids/:id` | owner or ADMIN | Bid detail; expires the row on read if the window has passed |
| POST | `/api/v1/bids` | BUYER/ADMIN | Place a bid and run deterministic partial matching |
| POST | `/api/v1/bids/:id/cancel` | owner or ADMIN | Cancel remaining unmatched demand |

Create matches immediately inside a serializable transaction. Optional `listingId` targets one listing; omitting it matches the cheapest compatible public listings. Self-trade on own listing returns 409 `SELF_TRADE` (sellers are also blocked by RBAC 403). Past `requiredUntil` returns 422 `WINDOW_IN_PAST`. Quantity integrity failures return 409 `QUANTITY_INTEGRITY`.

### Matches (S3)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/matches` | access token | List matches where the caller is buyer or seller |
| GET | `/api/v1/matches/:id` | participant or ADMIN | Match detail |

Match status starts as `PROPOSED`. Verified purchase moves it to `SETTLEMENT_PENDING`; verified `settleTrade` moves it to `SETTLED`.

### Trades (S4)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/trades` | access token | List trades where the caller is buyer or seller |
| GET | `/api/v1/trades/:id` | participant or ADMIN | Trade detail |
| POST | `/api/v1/trades/report` | participant | Report purchase, settle, or wallet rejection |

`POST /trades/report` body: `matchId`, `action` (`purchase` \| `settle` \| `reject`), `idempotencyKey`; `txHash` required except for `reject`.

The API queries `RPC_URL`, requires `CHAIN_ID` and `CONTRACT_ADDRESS`, and sets `CONFIRMED` only after a successful receipt plus the expected marketplace event, quantity, payment, and verified wallets. A missing receipt is `PENDING`. Reverts and invalid events are `FAILED` (`409`). Duplicate `txHash` / idempotency key returns `409 DUPLICATE_TX`. Wrong wallet/network/stale listing return `409`. The wallet UI cannot mark a trade `CONFIRMED`.

### Notifications (S5)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications` | access token | List own in-app notifications; `unreadOnly`, paginate |
| POST | `/api/v1/notifications/:id/read` | owner | Mark one notification read |
| POST | `/api/v1/notifications/read-all` | access token | Mark all notifications read |

Socket.IO (path `SOCKET_PATH`, default `/socket.io`) requires a valid access token handshake. Server events: `listing:created|updated|expired`, `bid:created|updated|matched|expired`, `match:created|updated`, `trade:pending|confirmed|failed`, `notification:new`, `dashboard:updated`. Clients do not emit privileged marketplace state. Duplicate deliveries carry the same `eventId`. REST remains authoritative; a socket `trade:confirmed` is only sent after `POST /trades/report` verification.

### Pricing (S6)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/pricing/recommendation` | access token | Advisory price from confirmed trades and live offers/bids |

Query: `energyType`, `marketZone`, `availableFrom`, `availableUntil`. Response `recommendation` includes `recommendedPrice` (null when insufficient), `range`, `confidence` (0–1), `reason`, `dataQuality`, `sourceLabel` (`ACTUAL`), `sampleCounts`, and `advisory: true`. The API never writes the recommended price onto a listing.

### Analytics (S6)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/analytics` | access token | Labelled metrics for the caller; ADMIN sees platform totals |

Query: `from`, `until`, `energyType`, `marketZone`. Energy traded and transaction value count only `CONFIRMED`/`COMPLETED` trades with `blockchainTxStatus=CONFIRMED`. Live supply is remaining kWh on ACTIVE/PARTIALLY_FILLED listings; live demand is unmatched kWh on OPEN/PARTIALLY_MATCHED bids. Carbon savings are `ESTIMATED`. Empty books return actual zeros, not sample data.

## Planned surface (later sprints)

`/reports`, `/ai`, `/iot`.

All mutations: Zod validation, RBAC, pagination/filter/sort on lists, idempotency keys where settlement occurs.

## Conventions

- HTTP 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict (e.g. oversell), 410 expired challenge,
  422 validation, 429 rate limit, 503 not ready
- Rate limit: 120 requests / minute / IP globally; 20 requests / minute / IP on `/auth/*`
- CORS origin from `WEB_ORIGIN`
- Socket.IO path from `SOCKET_PATH`; the handshake requires a valid access token and clients do not emit
  privileged events
