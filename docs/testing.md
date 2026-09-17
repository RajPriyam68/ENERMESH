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

## S1 coverage

- JWT: access/refresh round-trip, token-type isolation, tamper rejection, expiry derivation
- Passwords: bcrypt hash/verify, plaintext never stored
- Crypto helpers: stable hashing, constant-time comparison, random nonce length
- Wallet challenge message: deterministic, binds address/chain/nonce/timestamp
- Auth integration: register, duplicate email 409, weak password 422, credential-enumeration safety,
  refresh rotation and reuse rejection, logout invalidation, RBAC 401/403, profile/settings updates,
  unknown-field 422, password change with session revocation
- Wallet integration: real secp256k1 signatures, wrong signer rejection, nonce replay rejection,
  cross-account hijack rejection, invalid address 422, unlink
- Web: open-redirect sanitization and protected-path detection

Integration tests skip automatically when PostgreSQL is unreachable, rather than inventing a live database.

## Planned (later sprints)

Listing quantity constraints, bid lifecycle, matching races, expiration, overselling, invalid payment, wrong network, user rejection, RPC failure, revert, duplicate settlement, Socket.IO privilege isolation.

## Commands

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

Do not fabricate passing tests. If Postgres is absent, readiness tests that need the DB must assert degraded behaviour rather than inventing a live database.
