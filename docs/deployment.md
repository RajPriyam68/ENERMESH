# Deployment

Provider-agnostic. Changing host requires environment variables only. This document prepares EnerMesh for production; it does not deploy to a live provider.

Blockchain confirmation is never claimed from a MetaMask mined receipt. The API sets `CONFIRMED` only after receipt and event verification on the configured RPC (`POST /trades/report`).

## Services

1. PostgreSQL 16 — set `DATABASE_URL`
2. API Node 22 process or container — `apps/api`
3. Web — Next.js 15 (any Next host or Docker). Set `API_INTERNAL_URL` for server-side rewrites if the API is not on localhost.

## Environment

Copy `.env.example` to `.env`. Never commit `.env`, JWT secrets, database passwords, RPC secrets, or private keys.

### Required for production API

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Must be `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Unique, at least 32 characters, different from refresh |
| `JWT_REFRESH_SECRET` | Unique, at least 32 characters |
| `WEB_ORIGIN` | Explicit browser origin list (never `*`) |
| `API_HOST` / `API_PORT` | Bind address (container: `0.0.0.0:3001`) |
| `CHAIN_ID` / `CHAIN_NAME` / `RPC_URL` | EVM network (default Polygon Amoy `80002`) |
| `CONTRACT_ADDRESS` | Deployed EnerMeshMarketplace address |

### Required for production web

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Browser API prefix (`/api/v1` when using Next rewrites) |
| `API_INTERNAL_URL` | Server-side rewrite target for `/api/*` and `/socket.io/*` |
| `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` / `NEXT_PUBLIC_CONTRACT_ADDRESS` | MetaMask network and contract |
| `NEXT_PUBLIC_BLOCK_EXPLORER_URL` | Explorer links after backend confirmation |
| `NEXT_PUBLIC_SOCKET_URL` | Empty for same-origin rewrite; absolute origin only if the API is on another host |

### Optional

`USER_LLM_*` (AI), `MQTT_*` (IoT broker), `TRUST_PROXY` (hop count behind a reverse proxy), `SOCKET_CORS_ORIGIN`, `RUN_MIGRATIONS` (Docker entrypoint, default `true`).

Password reset mail:

| Variable | Purpose |
| --- | --- |
| `SMTP_URL` | Nodemailer SMTP/SMTPS URL. Required in production. Host/Windows Mailpit: `smtp://localhost:1025`. API in Docker Compose: `smtp://mailpit:1025` |
| `SMTP_FROM` | From header, e.g. `EnerMesh <noreply@localhost>` |
| `PASSWORD_RESET_TTL_MINUTES` | Token lifetime, default 60 |
| `PASSWORD_RESET_APP_URL` | Public web origin in the reset link; falls back to `WEB_ORIGIN` |

Local Mailpit (development only, compose profile `dev`). Not started by default `docker compose up`. Do not use Mailpit as a production mail endpoint.

From the EnerMesh project root:

```bash
# Start Mailpit
docker compose --profile dev up -d mailpit

# Verify the container is up
docker compose --profile dev ps

# Inspect host port mappings
docker compose --profile dev port mailpit 8025
docker compose --profile dev port mailpit 1025

# View logs
docker compose --profile dev logs --tail=100 mailpit
```

Expected:

- `ps` shows `enermesh-mailpit` Up, image `axllent/mailpit`
- `port mailpit 8025` prints `0.0.0.0:8025`
- `port mailpit 1025` prints `0.0.0.0:1025`

Inbox UI: `http://localhost:8025`

SMTP host depends on where the API process runs. Never use `localhost:1025` from inside the API container.

| API process | `SMTP_URL` |
| --- | --- |
| Host / Windows (`./start.sh`, `npm run dev:api`) | `smtp://localhost:1025` |
| Inside Docker Compose (`enermesh-api` + Mailpit on profile `dev`) | `smtp://mailpit:1025` |

Set `SMTP_FROM=EnerMesh <noreply@localhost>` and keep `PASSWORD_RESET_TTL_MINUTES` / `PASSWORD_RESET_APP_URL`. Switch production providers by changing `SMTP_URL` only.

Genuine SMTP check after Mailpit is up (host/Windows):

```bash
python3 - <<'PY'
import smtplib
from email.message import EmailMessage
msg = EmailMessage()
msg["From"] = "EnerMesh <noreply@localhost>"
msg["To"] = "buyer@example.test"
msg["Subject"] = "EnerMesh Mailpit connectivity test"
msg.set_content("If this appears in Mailpit, SMTP port 1025 is reachable from the host.")
with smtplib.SMTP("127.0.0.1", 1025, timeout=10) as smtp:
    smtp.send_message(msg)
print("smtp send ok")
PY

curl -sS http://localhost:8025/api/v1/messages
```

Success evidence: SMTP send prints `smtp send ok`; Mailpit UI or `/api/v1/messages` contains subject `EnerMesh Mailpit connectivity test`. Then submit Forgot password for an existing account and confirm a second message with subject `Reset your EnerMesh password`, From `EnerMesh <noreply@localhost>`, and a reset link under `PASSWORD_RESET_APP_URL`.

Admin bootstrap is out-of-band: `ADMIN_EMAIL` / `ADMIN_PASSWORD` / optional `ADMIN_DISPLAY_NAME` with `npm run seed:admin`.

Production refuses default/short/identical JWT secrets and wildcard `WEB_ORIGIN`. Refresh cookie is httpOnly, path `/api/v1/auth`, `SameSite=Lax`, `Secure` in production.

## Docker

Node 22 Alpine images. Non-root user `enermesh`. Shared package is built before API/web. No secrets are copied into images (`.dockerignore` excludes `.env`).

```bash
cp .env.example .env
# Set unique JWT secrets before compose up in production
docker compose config
docker compose up --build
```

Compose starts Postgres 16, API (3001), and web (3000). The API entrypoint runs `prisma migrate deploy` then `node dist/index.js`. Healthchecks:

- Postgres: `pg_isready`
- API: `GET /api/v1/ready` (database ping; 503 if Postgres is down)
- Web: HTTP GET `/`

Graceful stop: API handles `SIGTERM`/`SIGINT`, closes Socket.IO, HTTP, then Prisma.

Local development still uses `./start.sh` (API :3001, web :3000 with `/api` reverse proxy). Production without Compose:

```bash
chmod +x scripts/start-api-prod.sh scripts/start-web-prod.sh
./scripts/start-api-prod.sh
./scripts/start-web-prod.sh
```

## Frontend hosts (Vercel and other Next.js hosts)

- Build: `npm run build -w packages/shared && npm run build -w apps/web`
- Start: `npm run start:web` (or the host's Next start)
- Env: `NEXT_PUBLIC_*` baked at build time; `API_INTERNAL_URL` for rewrites
- Preview/single-port: keep `NEXT_PUBLIC_API_BASE_URL=/api/v1` so the rewrite proxies REST and Socket.IO
- Split origins: set `NEXT_PUBLIC_SOCKET_URL` to the API origin and allow that origin in `WEB_ORIGIN` / `SOCKET_CORS_ORIGIN`

No vendor SDK is required.

## API hosts (Render, Railway, Fly.io, AWS, Azure, GCP, any Docker host)

- Build: `npm run build -w packages/shared && npm run prisma:generate -w apps/api && npm run build -w apps/api`
- Migrate: `npm run db:deploy` (or Docker `RUN_MIGRATIONS=true`)
- Start: `npm run start:api` / `node apps/api/dist/index.js`
- Liveness: `GET /api/v1/health`
- Readiness: `GET /api/v1/ready`
- Set `TRUST_PROXY` to the hop count when behind the platform proxy so rate limits see the client IP

## PostgreSQL (Supabase, Neon, RDS, local, Compose)

Create an empty database, set `DATABASE_URL`, then `npm run db:deploy`. Do not use `db:push` in production. Rollback: restore a database backup, then restart the API on the matching image/commit.

## Socket.IO

Path `/socket.io`. Handshake requires a valid access token. Clients cannot emit privileged events. Same-origin: Next rewrites `/socket.io/*` to `API_INTERNAL_URL`. Sticky sessions or a single API instance are required for in-memory Socket.IO; REST remains the source of truth if a socket event is dropped.

## Polygon Amoy / MetaMask

Defaults: chain id `80002`, RPC `https://rpc-amoy.polygon.technology`, explorer `https://amoy.polygonscan.com`. Users add Amoy in MetaMask (wallet panel can prompt). Set `CONTRACT_ADDRESS` and `NEXT_PUBLIC_CONTRACT_ADDRESS` to the deployed marketplace. Deployer keys stay in the operator environment (`DEPLOYER_PRIVATE_KEY` is never committed).

## CORS and domains

`WEB_ORIGIN` is a comma-separated allowlist of browser origins. Production rejects `*`. After a domain change, update `WEB_ORIGIN`, `SOCKET_CORS_ORIGIN`, and rebuild/restart API (and web if `NEXT_PUBLIC_*` changed).

## Health, restart, rollback

1. Confirm `GET /api/v1/health` returns 200 and `sprint` `S12`
2. Confirm `GET /api/v1/ready` returns 200 with `database: connected`
3. Restart API: `docker compose restart api` or re-run the production start script
4. Rollback: deploy the previous image/commit, restore Postgres if a migration must be undone, then `db:deploy` only forward

CI does not deploy. GitHub Actions runs typecheck, lint, tests, production build, Hardhat tests, Compose validation, and Docker image builds without push.

## Final demo path

Seller registers and verifies a wallet → create offer → MetaMask `createListing` → backend `POST /listings/:id/on-chain` verifies `ListingCreated` and persists the on-chain listing id → marketplace browse → buyer bid → matching → trade review uses the persisted id → MetaMask on Polygon Amoy → backend `POST /trades/report` verifies receipt/event → DB `CONFIRMED` → Socket.IO/notification → dashboards/reports/admin → explorer link from `BLOCK_EXPLORER_URL` + `txHash`.

A wallet UI mined receipt stays `PENDING` until backend verification.
