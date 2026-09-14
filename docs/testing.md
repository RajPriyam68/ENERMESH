# Testing

## Layers

| Layer | Tool | Location |
| --- | --- | --- |
| Shared matching | Node test runner | `packages/shared/src/__tests__` |
| API HTTP | Node test runner + Express listen | `apps/api/src/__tests__` |
| Web helpers | Node test runner | `apps/web/src/lib/__tests__` |
| Solidity | Hardhat + Chai | `packages/contracts/test` |

## S0 coverage

- Partial match 100 kWh vs 30 kWh → 30 matched, 70 remaining
- Price, type, zone, window, self-trade rejection
- API `/health` 200 envelope
- Contract compile of AccessControl/Pausable skeleton (Hardhat EVM `hardhat test` can SIGBUS in this environment; S0 verifies compile)

## Planned (later sprints)

Auth/RBAC, listing quantity constraints, bid lifecycle, matching races, expiration, overselling, invalid payment, wallet mismatch, wrong network, user rejection, RPC failure, revert, duplicate settlement, Socket.IO privilege isolation.

## Commands

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

Do not fabricate passing tests. If Postgres is absent, readiness tests that need the DB must assert degraded behaviour rather than inventing a live database.
