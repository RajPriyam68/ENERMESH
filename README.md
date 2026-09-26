# EnerMesh

**Connect Energy. Match Demand. Trade with Trust.**

EnerMesh is a blockchain-based peer-to-peer renewable energy marketplace. Prosumers list surplus energy, buyers bid, a deterministic backend matcher produces partial or full matches, and settlement evidence is recorded on an EVM network (Polygon Amoy by default).

Blockchain stores **digital trade evidence**. It does not move physical electricity.

Academic title: *EnerMesh: A Blockchain-Based Peer-to-Peer Renewable Energy Marketplace with Intelligent Matching, Dynamic Price Discovery, and Transparent Settlement.*

## Current sprint

**S8 — IoT adapters and labelled EnergyHistory** is complete. Simulated samples stay SIMULATED and never invent marketplace volume. Next is reports/admin (S9). See `docs/PROJECT_STATE.md`.

## Architecture

```
apps/web          Next.js 15 frontend (preview entry; /api proxied to API)
apps/api          Express + Prisma + Socket.IO
packages/shared   Shared types, Zod schemas, matching helpers
packages/contracts  Solidity + Hardhat
docs              Architecture, API, database, blockchain, testing, deployment
```

Flow: Frontend → API → PostgreSQL → Matching → MetaMask → Contract → Network → Receipt/Event verification → DB → Socket.IO → Frontend.

## Prerequisites

- Node.js 22+
- npm 10+
- PostgreSQL 16+ (local, Docker, or any compatible host)
- Optional: MetaMask and Polygon Amoy for Sprint 4+

## Quick start

```bash
# Install workspace dependencies
npm install

# Environment (never commit real secrets)
cp .env.example .env

# Optional: start PostgreSQL via Compose
docker compose up -d postgres

# Generate Prisma client and apply schema
npm run db:generate
npm run db:push

# Optional: first admin (never self-assigned through /register)
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='ChangeMe123' npm run seed:admin

# Development (API :3001, web :3000 with /api reverse proxy)
chmod +x start.sh
./start.sh
```

Web is the preview entrypoint. The Next.js rewrite proxy forwards `/api/*` to the API so a single exposed port works.

## Health

- API liveness: `GET /api/v1/health`
- API readiness: `GET /api/v1/ready`
- OpenAPI JSON: `GET /api/v1/docs.json`
- Swagger UI: `GET /api/v1/docs`

## Provider-agnostic deployment

No cloud vendor is hardcoded. Compatible hosts:

| Layer | Examples |
| --- | --- |
| Frontend | Vercel, any Next.js host |
| API | Render, Railway, AWS, Azure, GCP, Fly.io, any Docker host |
| PostgreSQL | Supabase, Neon, RDS, local, any Postgres 16 |
| Chain | Polygon Amoy or any EVM via `CHAIN_ID` / `RPC_URL` / `CONTRACT_ADDRESS` |

Switching providers is configuration only (`.env`). See `docs/deployment.md`.

## Security notes

- Never store or log private keys, JWT secrets, or LLM keys in source.
- Frontend validation is advisory; the API re-validates every mutation.
- Trades are `CONFIRMED` only after backend receipt/event verification.
- Core marketplace works without AI keys.

## Documentation

- `docs/architecture.md`
- `docs/database.md`
- `docs/api.md`
- `docs/blockchain.md`
- `docs/deployment.md`
- `docs/testing.md`
- `docs/FEATURE_TRACEABILITY.md`
- `docs/PROJECT_STATE.md`

## License

MIT
