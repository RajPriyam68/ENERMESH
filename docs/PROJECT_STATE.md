# EnerMesh project state

Last updated: 2026-09-28
Current sprint: **S9 Reports, admin, audit logs** — COMPLETE
Next sprint: S10 Security, testing, performance. Hybrid on-chain listing ids remain later polish.

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
| S10 | Security, testing, performance | NOT STARTED |
| S11 | Docker/CI polish, production scripts, demo path | NOT STARTED |
| S12 | Hybrid DB sync / on-chain listing id persistence (deferred polish) | NOT STARTED |

## What exists after S9

Building on S8:

- **Reports** — ADMIN-only `GET /reports/marketplace`, `/reports/settlement`, `/reports/telemetry`. Marketplace and settlement reuse labelled S6 analytics (confirmed trades only). Telemetry sums EnergyHistory without writing listings, bids, matches, or `CONFIRMED` trades. Empty books stay at actual 0.
- **Admin users** — `GET /admin/users` filters by role, active flag, and search. `PATCH /admin/users/:id` sets `isActive` only. Self-deactivation is 409. The last active ADMIN cannot be disabled. Disable revokes refresh sessions. Role is never assigned through `/register`.
- **Audit logs** — `GET /admin/audit-logs` lists real `AuditLog` rows with action, entity, actor, IP, and metadata. Admin disable writes `ADMIN_ACTION` with `operation=set_active`.
- **Web** — `/admin`, `/admin/audit`, `/admin/reports` are ADMIN-gated with loading, empty, and error states. Nav links appear only for ADMIN.

## Validation (S9)

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npx hardhat test` in `packages/contracts`

S9 test coverage added:

- Shared: empty telemetry stays 0; admin patch rejects role assignment; inverted report windows fail validation.
- API: unauthenticated 401; buyer/seller 403; labelled zeros; audit rows after register; disable seller + self-deactivation 409; EnergyHistory does not change confirmed volume.
- Web: `/admin` paths protected; query encoding; `energy:updated` and `trade:confirmed` invalidate `reports` keys.

## Explicitly out of S9

- Security/performance hardening sprint (S10)
- Persisting on-chain listing ids on the Listing row
- Fabricated marketplace volume or settlement results
- Treating wallet UI mined receipts as `CONFIRMED`
- MQTT broker connection or live meter polling
- Promoting users to ADMIN through the public API

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)
- Shared package must be built (`npm run build -w packages/shared`) before API/web typecheck against `dist`.
- Settlement tests mock JSON-RPC; they do not call a live chain.
- AI tests do not call a live LLM. They assert the unconfigured fallback path.
- IoT tests do not connect MQTT. They assert labelled HTTP/simulated EnergyHistory rows.

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics are recorded from real listings, bids, matches, and confirmed trades. No fabricated numbers.
