# Blockchain

Network is **configurable**. Defaults target Polygon Amoy (`CHAIN_ID=80002`) but any EVM RPC works.

## Role of the chain

Digital evidence of a trade: listing/trade IDs, seller and buyer wallets, quantity, price, timestamp.

Not stored on-chain: PII, passwords, private keys, large datasets, AI outputs.

## Contract (S4)

`packages/contracts/contracts/EnerMeshMarketplace.sol`

- OpenZeppelin `AccessControl`, `Pausable`, `ReentrancyGuard`
- Events: `ListingCreated`, `ListingUpdated`, `ListingCancelled`, `EnergyPurchased`, `TradeSettled`
- `pause` / `unpause` (admin)
- `createListing(quantityKwh, pricePerKwh, externalId)` — remaining energy and wei per unit
- `updateListing` / `cancelListing` — seller or operator
- `purchaseEnergy(listingId, quantityKwh)` payable — exact `quantity * price`, no self-trade, no oversell
- `settleTrade(tradeId)` — buyer, seller, or operator; pays the seller with `Address.sendValue`

Units: milli-kWh (`kWh * 1000`) and wei per milli-kWh. Network/RPC/address come from `CHAIN_ID`, `RPC_URL`, `CONTRACT_ADDRESS` (and `NEXT_PUBLIC_*` on the web).

## Confirmation policy (S4)

Frontend wallet states: `WAITING_FOR_SIGNATURE | PENDING | FAILED | REJECTED`. A mined wallet receipt stays `PENDING`.

User rejection, RPC failure, and on-chain revert are distinct. The API sets DB `CONFIRMED` only after `POST /trades/report`:

1. Transaction receipt with success on the configured RPC
2. Expected event (`EnergyPurchased` or `TradeSettled`) on the configured contract
3. Quantity, payment, and wallets match the intended trade and verified addresses
4. Idempotency key / `txHash` uniqueness
5. Chain id equals `CHAIN_ID`

A missing receipt is stored as `PENDING`. A revert or invalid event is `FAILED`. Wallet rejection is `REJECTED` and has no `txHash`.

Explorer URL is composed from `BLOCK_EXPLORER_URL` + `txHash`. No vendor is hardcoded in application logic.

## Keys

Deployer keys stay in the operator environment, never in the repo, never in the Next.js bundle. Users sign with MetaMask. The API never stores or logs private keys.
