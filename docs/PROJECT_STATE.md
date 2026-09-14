# EnerMesh project state

Last updated: 2026-09-14
Current sprint: **S0 Foundation / design** — COMPLETE
Next sprint: S1 Auth / RBAC

## Protocol

Before each sprint: read this file, inspect the repo, implement **only** the current sprint, integrate prior work, validate security, add UX states and tests, typecheck/lint/build, update docs, report, **stop**.

## Sprint status

| Sprint | Scope | Status |
| --- | --- | --- |
| S0 | Monorepo, design docs, Prisma schema, API/web/contract shells, CI, Docker, env | COMPLETE |
| S1 | Register/login/logout, JWT access/refresh, bcrypt, RBAC, profile, wallet nonce/signature | NOT STARTED |
| S2 | Seller listings, buyer browse/filter/sort/paginate, quantity integrity | NOT STARTED |
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

## What exists after S0

- npm workspaces: `apps/web`, `apps/api`, `packages/shared`, `packages/contracts`
- Prisma schema for User, Wallet, Listing, Bid, Match, Trade, Notification, EnergyHistory, AuditLog, RefreshToken
- Express API with Helmet, CORS, rate limit, health/ready, OpenAPI stub, Socket.IO hello
- Next.js 15 app with landing, about, marketplace empty state, login/register placeholders, 404
- Reverse proxy `/api` → API (`next.config.ts` rewrites)
- Shared enums, Zod schemas, deterministic matching helper + unit tests
- Solidity skeleton with AccessControl, Pausable, ReentrancyGuard; marketplace methods revert until S4
- `.env.example`, Docker Compose, Dockerfiles, GitHub Actions CI
- Design and operations docs listed in README

## Validation (S0)

- `npm run typecheck` — pass (shared, api, web, contracts compile)
- `npm run lint` — pass (ESLint workspaces; solhint warnings only on placeholder reverts)
- `npm run test` — pass (shared matching, API health, web formatKwh; contracts compile)
- `npm run build -w packages/shared` — pass
- `npm run build -w apps/api` — pass
- `npm run build -w apps/web` — pass (Next.js 15 production)
- `npx hardhat compile` — pass

Hardhat `hardhat test` (in-process EVM) SIGBUS in this environment; S0 records compile as the contract check. Runtime tests remain in `packages/contracts/test` for S4+.

## Explicitly out of S0

- Working auth, marketplace CRUD, matching engine persistence, MetaMask flows, AI, IoT, reports
- Hardcoded marketplace volume or fabricated AI results (none present)
- Private keys in env templates

## Known environment notes

- Node 22 is required and available in this workspace
- Docker may be unavailable in some preview environments; API still runs against `DATABASE_URL`
- Readiness (`/ready`) reports degraded if Postgres is down; liveness (`/health`) still returns 200
- Tailwind CSS 3 is used (v4 native oxide crashed SIGBUS in this environment)

## Research question

How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?

Metrics will be recorded from real system behaviour starting when matching and settlement exist. No fabricated numbers.
