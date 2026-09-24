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
| Auth register/login/logout + JWT rotation | S1 | `apps/api/src/services/auth.service.ts`, `apps/api/src/routes/auth.ts` | Reuse attempts rejected = 100% |
| RBAC (BUYER/SELLER/ADMIN) | S1 | `apps/api/src/middleware/auth.ts`, `apps/api/src/routes/admin.ts` | Cross-role 403 rate = 100% |
| bcrypt password storage | S1 | `apps/api/src/lib/password.ts` | Plaintext/hash leakage = 0 |
| Profile + settings + password change | S1 | `apps/api/src/services/user.service.ts`, `apps/web/src/components/auth` | Session invalidation on change |
| Wallet nonce + signature verify | S1 | `apps/api/src/services/wallet.service.ts`, `apps/web/src/components/wallet/wallet-panel.tsx` | Replay accepted = 0 |
| Listings + no oversell | S2 | `apps/api/src/services/listing.service.ts`, `packages/shared/src/quantity.ts`, `apps/web/src/app/marketplace` | Oversell attempts blocked; empty catalog stays empty |
| Bids + persistent matching | S3 | `apps/api/src/services/matching.service.ts`, `packages/shared/src/matching.ts`, `apps/web/src/app/bids` | Partial fill 100 vs 30; concurrent oversell blocked |
| MetaMask + Solidity trade | S4 | `packages/contracts/contracts/EnerMeshMarketplace.sol`, `apps/web/src/components/trades` | Rejection vs revert vs fail |
| Receipt verification | S4 | `apps/api/src/services/settlement.service.ts`, `POST /trades/report` | False confirm = 0; pending/failed/rejected distinct |
| Socket.IO notifications | S5 | `apps/api/src/socket/index.ts`, `apps/api/src/services/notification.service.ts`, `apps/web/src/lib/use-realtime.ts` | Event latency; client emit accepted = 0 |
| Price + analytics | S7 | planned | Confidence, dataQuality labelled |
| AI adapters | S8 | planned | Advisory-only; app works without key |
| IoT adapters | S9 | planned | Simulated vs actual labels |
| Reports / admin / audit | S10 | planned | Audit completeness |
| Security tests | S11 | planned | Failure rate |
| Deploy polish | S12 | planned | Demo path green |

No row may be marked measured with invented numbers.
