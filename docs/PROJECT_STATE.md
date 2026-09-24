# EnerMesh project state

Last updated: 2026-09-23
Current sprint: **S5 Socket.IO + in-app notifications** — COMPLETE
Next sprint: S6 remaining hybrid polish (on-chain listing ids on the Listing row)

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
| S6 | Hybrid DB sync / on-chain listing id persistence | NOT STARTED |
| S7 | Advisory price recommendation, analytics dashboards | NOT STARTED |
| S8 | Provider-independent AI adapters (optional) | NOT STARTED |
| S9 | IoT adapters, EnergyHistory, simulated-data labels | NOT STARTED |
| S10 | Reports, admin, audit logs | NOT STARTED |
| S11 | Security, testing, performance | NOT STARTED |
| S12 | Docker/CI polish, production scripts, demo path | NOT STARTED |

## What exists after S5

Building on S4:

- **Socket.IO** — handshake still requires a valid access token for an active account. Authenticated sockets join `user:{id}` and `marketplace`. Privileged marketplace events are server-emitted only after a successful validated write. Clients cannot confirm trades or mutate listings/bids/matches over the socket.
- **Event surface** — listing created/updated/expired, bid created/updated/matched/expired, match created/updated, trade pending/confirmed/failed, notification:new, dashboard:updated. Payloads include `eventId` for duplicate suppression.
- **Notifications** — Prisma `Notification` rows are written for listing, bid match, trade, and wallet events when `notificationInApp` is enabled. REST: `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
- **Web** — authenticated Socket.IO client with reconnect, query invalidation via TanStack Query, inbox + unread badge, live/reconnect/error status. REST remains the source of truth; socket payloads never mark a trade `CONFIRMED`.
- **Matching retry** — serializable matching retries on Prisma `P2034` and Postgres `40001` / `40P01` / concurrent-update text.

## Validation (S5)

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npx hardhat test` in `packages/contracts`

S5 test coverage added:

- Handshake rejects missing/invalid tokens; `system:hello` reports sprint S5 after a valid access token.
- `listing:created` is emitted only after a 201 listing write; client-originated privileged emits are ignored.
- Notification list is authenticated; foreign/missing mark-read returns 404; listing author receives `LISTING_CREATED`, other users do not.
- Web realtime helpers map events to query keys and drop duplicate `eventId`s.

## Explicitly out of S5

- Persisting on-chain listing ids on the Listing row
- Price/AI, IoT, reports
- Fabricated marketplace volume or settlement results
- Treating wallet UI mined receipts as `CONFIRMED`

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement tests mock JSON-RPC; they do not call a live chain.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics will be recorded from real system behaviour starting when matching and settlement exist. No fabricated numbers.
