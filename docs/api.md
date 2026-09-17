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

## Planned surface (later sprints)

`/listings`, `/bids`, `/matches`, `/transactions`, `/dashboard`, `/analytics`, `/notifications`, `/reports`,
`/ai`, `/iot`.

All mutations: Zod validation, RBAC, pagination/filter/sort on lists, idempotency keys where settlement occurs.

## Conventions

- HTTP 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict (e.g. oversell), 410 expired challenge,
  422 validation, 429 rate limit, 503 not ready
- Rate limit: 120 requests / minute / IP globally; 20 requests / minute / IP on `/auth/*`
- CORS origin from `WEB_ORIGIN`
- Socket.IO path from `SOCKET_PATH`; the handshake requires a valid access token and clients do not emit
  privileged events
