# Blockchain

Network is **configurable**. Defaults target Polygon Amoy (`CHAIN_ID=80002`) but any EVM RPC works.

## Role of the chain

Digital evidence of a trade: listing/trade IDs, seller and buyer wallets, quantity, price, timestamp.

Not stored on-chain: PII, passwords, private keys, large datasets, AI outputs.

## Contract (S0)

`packages/contracts/contracts/EnerMeshMarketplace.sol`

- OpenZeppelin `AccessControl`, `Pausable`, `ReentrancyGuard`
- Events: `ListingCreated`, `ListingUpdated`, `ListingCancelled`, `EnergyPurchased`, `TradeSettled`
- `pause` / `unpause` live in S0
- `createListing`, `updateListing`, `cancelListing`, `purchaseEnergy`, `settleTrade` revert with a sprint message until S4

## Confirmation policy (S5)

Frontend states: `WAITING_FOR_SIGNATURE | PENDING | CONFIRMED | FAILED | REJECTED`.

User rejection, RPC failure, and on-chain revert are distinct. The API sets DB `CONFIRMED` only after:

1. Transaction receipt with success
2. Expected event on the configured contract
3. Quantity/price/wallet match against the intended trade
4. Idempotency key / `txHash` uniqueness

Explorer URL is composed from `BLOCK_EXPLORER_URL` + `txHash`. No vendor is hardcoded in application logic.

## Keys

Deployer keys stay in the operator environment, never in the repo, never in the Next.js bundle. Users sign with MetaMask.
