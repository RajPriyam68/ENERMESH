# API

Base path: `/api/v1`. JSON envelope:

```json
{ "success": true, "data": {}, "meta": {} }
```

Errors:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

## Sprint 0 endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | public | Liveness |
| GET | `/api/v1/ready` | public | Readiness + database ping |
| GET | `/api/v1/docs` | public | Swagger UI |
| GET | `/api/v1/docs.json` | public | OpenAPI document |

## Planned surface (later sprints)

`/auth`, `/users`, `/wallet`, `/listings`, `/bids`, `/matches`, `/transactions`, `/dashboard`, `/analytics`, `/notifications`, `/reports`, `/ai`, `/iot`, `/admin`.

All mutations: Zod validation, RBAC, pagination/filter/sort on lists, idempotency keys where settlement occurs.

## Conventions

- HTTP 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict (e.g. oversell), 422 validation, 429 rate limit, 503 not ready
- Rate limit: 120 requests / minute / IP (tunable later)
- CORS origin from `WEB_ORIGIN`
- Socket.IO path from `SOCKET_PATH`; clients do not emit privileged events
