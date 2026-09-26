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

## S2 coverage

- Quantity integrity: balanced triple, oversell, available+sold mismatch, negatives, initialise sold=0, resize remaining without changing sold
- Listing create: verified wallet required (409), buyer 403, unauthenticated 401, maxTrade > available 422, unknown sold field 422
- Public browse: energy type / zone filter, price sort, page/pageSize/total/totalPages
- Owner update does not invent sold volume; cross-seller edit 403; cancel hides from public browse; unknown id 404
- Web: catalog query encoding, datetime-local round-trip, protected `/offers` paths

## S3 coverage

- Matcher: 100 vs 30 partial fill, cheapest-listing-first, min-trade rejection, self-trade, type/zone/window/price incompatibility
- Fill helpers: listing available→sold, bid unmatched→matched, integrity after fill
- Bid API: unauthenticated 401, seller 403, targeted partial fill, concurrent last-40 kWh race without oversell, open-market cheaper-first, incompatible type unmatched, past window 422, foreign bid 403, cancel remaining demand
- Web: protected `/bids` and `/matches` paths

## S4 coverage

- Contract: listing/purchase/settle, pause, self-trade, oversell, incorrect payment, duplicate settle
- Web encoding and confirmation policy: mined wallet receipt is never `CONFIRMED`
- Event parsing: `EnergyPurchased` / `TradeSettled` only from the configured contract
- Trade report API: unauthenticated 401, wallet reject, pending without receipt, confirm after receipt, idempotent confirm, duplicate txHash, wrong wallet, seller 403, wrong network, missing event, reverted receipt, cancelled listing, settle after purchase
- JSON-RPC is mocked in API tests; no live chain is required

## S5 coverage

- Socket handshake: missing token and invalid token rejected with `UNAUTHENTICATED`
- Valid access token receives `system:hello` with sprint label (S7 after this sprint)
- `listing:created` emitted only after a validated POST; client-originated privileged emits are ignored
- Notification REST: unauthenticated 401, missing id 404, listing author receives `LISTING_CREATED`
- Web: socket event → query-key mapping; duplicate `eventId` dropped

## S6 coverage

- Shared price recommender: empty book → null + INSUFFICIENT; completed trades outweigh outlier asks; advisory flag always true
- Shared analytics helpers: VWAP undefined on zero volume; carbon savings labelled ESTIMATED; empty sums stay ACTUAL 0
- Price API: unauthenticated 401; empty filters INSUFFICIENT; live listing produces advisory ask from remaining kWh
- Analytics API: unauthenticated 401; labelled zeros; seller supply from own remaining kWh; foreign confirmed volume does not leak
- Web: `/dashboard` protected; price query encoding; socket events invalidate analytics/pricing keys

## S7 coverage

- Shared sanitizer redacts injection phrases; empty-book fallback keeps kWh at 0 and price null
- Model JSON must match the insight schema; malformed output is discarded
- AI API: unauthenticated 401; invalid body 422; unconfigured status without secrets; live listing remaining kWh; foreign bid 403; unknown listing 404
- Web: `/advisor` protected; request builder never adds execute flags

## Planned (later sprints)

IoT / EnergyHistory adapters; listing on-chain id persistence on the Listing row.

## Commands

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

Do not fabricate passing tests. If Postgres is absent, readiness tests that need the DB must assert degraded behaviour rather than inventing a live database.
