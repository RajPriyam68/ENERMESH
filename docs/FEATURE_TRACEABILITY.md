# Feature traceability

Research question: *How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?*

| Requirement | Sprint | Code / docs | Metric (when live) |
| --- | --- | --- | --- |
| Monorepo + provider-agnostic config | S0 | `package.json`, `.env.example`, `docs/deployment.md` | n/a |
| Prisma entities + quantity columns | S0 | `apps/api/prisma/schema.prisma` | Constraint violations = 0 |
| Shared matching rules (pure) | S0 | `packages/shared/src/matching.ts` | Unit: 100+30 partial fill |
| API health / OpenAPI | S0 | `apps/api/src` | Liveness success rate |
| Landing + empty marketplace | S0 | `apps/web/src/app` | No mocked volume |
| Contract skeleton + pause | S0 | `packages/contracts` | Pause blocks calls |
| Auth JWT/RBAC/wallet verify | S1 | planned | Auth failure rate |
| Listings + no oversell | S2 | planned | Oversell attempts blocked |
| Bids + persistent matching | S3 | planned | Match success, time, unmatched kWh |
| MetaMask + Solidity trade | S4 | planned | Rejection vs revert vs fail |
| Receipt verification | S5 | planned | Settlement time, false confirm = 0 |
| Socket.IO notifications | S6 | planned | Event latency |
| Price + analytics | S7 | planned | Confidence, dataQuality labelled |
| AI adapters | S8 | planned | Advisory-only; app works without key |
| IoT adapters | S9 | planned | Simulated vs actual labels |
| Reports / admin / audit | S10 | planned | Audit completeness |
| Security tests | S11 | planned | Failure rate |
| Deploy polish | S12 | planned | Demo path green |

No row may be marked measured with invented numbers.
