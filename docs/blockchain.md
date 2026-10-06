# Blockchain

Network is **configurable**. Defaults target Polygon Amoy (`CHAIN_ID=80002`) but any EVM RPC works.

## Role of the chain

Digital evidence of a trade: listing/trade IDs, seller and buyer wallets, quantity, price, timestamp.

Not stored on-chain: PII, passwords, private keys, large datasets, AI outputs.

## Contract (S4)

`packages/contracts/contracts/EnerMeshMarketplace.sol`

- OpenZeppelin `AccessControl`, `Pausable`, `ReentrancyGuard`
- Events: `ListingCreated`, `ListingUpdated`, `ListingCancelled`, `EnergyPurchased`, `TradeSettled`, `TradeRefunded`
- `pause` / `unpause` (admin)
- `createListing(quantityKwh, pricePerKwh, externalId)` — remaining energy and wei per unit; non-zero `externalId` is unique
- `updateListing` / `cancelListing` — seller or operator; cancel reverts with `escrow pending` while an unsettled purchase holds funds
- `purchaseEnergy(listingId, quantityKwh)` payable — exact `quantity * price`, no self-trade, no oversell; increments `listingEscrowed`
- `settleTrade(tradeId)` — buyer, seller, or operator; pays the seller with `Address.sendValue`; emits `TradeSettled`
- `refundTrade(tradeId)` — operator only; returns escrow to the buyer, restores listing quantity, emits `TradeRefunded` (not `TradeSettled`)

Units: milli-kWh (`kWh * 1000`) and wei per milli-kWh. Network/RPC/address come from `CHAIN_ID`, `RPC_URL`, `CONTRACT_ADDRESS` (and `NEXT_PUBLIC_*` on the web).

## Confirmation policy (S4)

Frontend wallet states: `WAITING_FOR_SIGNATURE | PENDING | FAILED | REJECTED`. A mined wallet receipt stays `PENDING`.

User rejection, RPC failure, and on-chain revert are distinct. The API persists `Listing.onChainListingId` only after `POST /listings/:id/on-chain`:

1. Transaction receipt with success on the configured RPC
2. Expected `ListingCreated` on the configured contract
3. Seller wallet, quantity, price, and `externalId` match the off-chain listing
4. Idempotency key / `txHash` uniqueness and unique on-chain listing id
5. Chain id equals `CHAIN_ID`

A missing receipt is stored as `PENDING` with no listing id. A revert or invalid event is `FAILED`. Wallet rejection is `REJECTED` and has no `txHash`.

The API sets trade DB `CONFIRMED` only after `POST /trades/report`:

1. Transaction receipt with success on the configured RPC
2. Expected event (`EnergyPurchased` or `TradeSettled`) on the configured contract
3. Quantity, payment, and wallets match the intended trade and verified addresses
4. `EnergyPurchased.listingId` equals the live `Listing.onChainListingId` (fail closed if unmapped); `TradeSettled.tradeId` equals the persisted purchase `onChainTradeId`
5. Receipt/tx hash equals the reported `txHash`
6. Idempotency key / `txHash` uniqueness
7. Chain id equals `CHAIN_ID`

Confirmed rows persist `Trade.onChainListingId` and `Trade.onChainTradeId`. A missing receipt is stored as `PENDING`. A revert or invalid event is `FAILED`. Wallet rejection is `REJECTED` and has no `txHash`; the match stays `PROPOSED` so the buyer can retry. Off-chain listing cancel does not send `cancelListing` on-chain; a later purchase report still fails `STALE_TRADE`.

Explorer URL is composed from `BLOCK_EXPLORER_URL` + `txHash`. No vendor is hardcoded in application logic.

## Keys

Deployer keys stay in the operator environment (`DEPLOYER_PRIVATE_KEY` is optional and never committed), never in images, never in the Next.js bundle. Users sign with MetaMask. The API never stores or logs private keys. Wallet UI mined receipts are not `CONFIRMED` until `POST /trades/report` or `POST /listings/:id/on-chain` verifies the receipt and event.
