# EnerMesh project state

Last updated: 2026-09-16
Current sprint: **S1 Auth / RBAC** — COMPLETE
Next sprint: S2 Seller listings + buyer browse/filter

## Protocol

Before each sprint: read this file, inspect the repo, implement **only** the current sprint, integrate prior work, validate security, add UX states and tests, typecheck/lint/build, update docs, report, **stop**.

## Sprint status

| Sprint | Scope | Status |
| --- | --- | --- |
| S0 | Monorepo, design docs, Prisma schema, API/web/contract shells, CI, Docker, env | COMPLETE |
| S1 | Register/login/logout, JWT access/refresh, bcrypt, RBAC, profile, wallet nonce/signature | COMPLETE |
| S2 | Seller listings, buyer browse/filter/sort/paginate, quantity integrity | NEXT |
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

## What exists after S1

Building on S0:

- **Auth API** — `POST /auth/register|login|refresh|logout`, `GET /auth/me`. Roles BUYER/SELLER at
  registration; ADMIN is provisioned out-of-band via `npm run seed:admin`.
- **Session model** — 15-minute JWT access tokens returned in the response body and held in memory by the
  client; 7-day refresh tokens stored hashed in `RefreshToken` and delivered as an httpOnly, path-scoped
  cookie. Refresh rotates atomically; reuse is rejected.
- **Password security** — bcrypt hashing (`BCRYPT_ROUNDS`), strength rules (10+ chars, upper, lower, digit),
  and password change revokes every refresh session.
- **RBAC** — `authenticate` reloads the user per request (immediate role/deactivation effect);
  `authorize(...roles)` guards admin routes. Admin user listing is paginated.
- **Profile and settings** — display name, phone, bio; default market zone, energy interests, notification
  preferences. Strict schemas reject unknown fields.
- **Wallet verification** — server-issued, single-use, 5-minute EIP-191 challenge binding address, chain ID,
  nonce and timestamp. Signatures are recovered with ethers v6; a mismatched signer is rejected and the nonce
  is consumed. Wallets can be listed and unlinked.
- **Realtime auth** — Socket.IO handshake now requires a valid access token for an active account; each socket
  joins a per-user room.
- **Web** — working login/register forms (React Hook Form + Zod), in-memory auth store (Zustand), session
  bootstrap via refresh cookie, proactive token refresh, protected `/profile` and `/settings` routes, wallet
  connect/verify panel, header session state, loading/empty/error/pending states.
- **Docs** — OpenAPI document expands to the S1 surface; `docs/api.md` covers the S1 endpoints.
- **Migrations** — initial Prisma migration `20260916000000_s1_auth` baselined and tracked.
- **CI** — GitHub Actions now provisions PostgreSQL 15, pushes the schema, then typechecks, lints, tests and
  builds.

## Validation (S1)

- `npm run typecheck` — pass (shared, api, web)
- `npm run lint` — pass (shared, api, web)
- `npm run test` — pass (API 26 tests, shared matching, web unit tests)
- `npm run build -w packages/shared` — pass
- `npm run build -w apps/api` — pass
- `npm run build -w apps/web` — pass (Next.js 15 production)
- `npx hardhat compile` — pass (unchanged from S0)
- Live smoke test against `:3001` — 18/18 checks pass, including duplicate-email 409, weak-password 422,
  unknown-field 422, nonce replay rejection, cross-account wallet hijack rejection, RBAC 403/401, refresh
  rotation, refresh reuse rejection, and logout invalidation

S1 test coverage added:

- `apps/api/src/__tests__/auth.test.ts` — JWT round-trip/type isolation/tamper, bcrypt, crypto helpers,
  challenge message determinism, and integration flows for register, duplicate email, weak password,
  credential enumeration safety, refresh rotation/reuse, logout, RBAC, profile/settings, password change.
- `apps/api/src/__tests__/wallet.test.ts` — real secp256k1 signatures from `ethers.Wallet`, wrong-signer
  rejection, replay rejection, cross-account rejection, invalid address validation, unlink.
- `apps/web/src/lib/__tests__/routes.test.ts` — open-redirect sanitization and protected-path detection.

Hardhat `hardhat test` (in-process EVM) SIGBUS in this environment; compile remains the contract check.
Runtime tests remain in `packages/contracts/test` for S4+.

## Explicitly out of S1

- Listing/bid CRUD, matching persistence, MetaMask transactions, price/AI, IoT, reports
- Password reset by email (documented as a later sprint)
- Hardcoded marketplace volume or fabricated AI results (none present)
- Private keys in env templates or repository

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- This workspace had a damaged `npm install`; several packages were restored by hand
  (`react-hook-form`, `socket.io-client`, `confbox`, `commander@10`, and others). Re-running
  `npm install` may damage them again, so prefer targeted restores.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics will be recorded from real system behaviour starting when matching and settlement exist. No fabricated numbers.
