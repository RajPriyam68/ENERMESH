# Deployment

Provider-agnostic. Changing host requires env vars only.

## Services

1. PostgreSQL — set `DATABASE_URL`
2. API container or Node process — `apps/api`
3. Web — Next.js (Vercel or Docker). Set `API_INTERNAL_URL` for server-side rewrites if the API is not on localhost.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Compose starts Postgres, API (3001), and web (3000). Healthchecks are defined for Postgres and API.

## Frontend hosts (Vercel and others)

- Build: `npm run build -w packages/shared && npm run build -w apps/web`
- Env: `NEXT_PUBLIC_*` and, if using Next rewrites at runtime, `API_INTERNAL_URL`

## API hosts (Render, Railway, Fly, AWS, Azure, GCP, Docker)

- Build: `npm run build -w packages/shared && npm run prisma:generate -w apps/api && npm run build -w apps/api`
- Start: `node apps/api/dist/index.js` (or workspace start script)
- Health: `/api/v1/health` and `/api/v1/ready`

## GitHub Actions

`.github/workflows/ci.yml` runs typecheck, lint, test, build, and contract compile on Node 22.

## Secrets

Use the host secret store. Never commit `.env`. LLM keys are optional (`USER_LLM_*`) and stay on the API. The marketplace works when they are empty; S7 then returns a deterministic labelled fallback.
