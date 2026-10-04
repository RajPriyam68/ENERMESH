-- S12: persist a verified on-chain listing id and confirmation metadata.
-- Unique constraints allow multiple NULLs in PostgreSQL.

ALTER TABLE "Listing" ADD COLUMN "onChainTxHash" TEXT,
ADD COLUMN "onChainIdempotencyKey" TEXT,
ADD COLUMN "onChainContractAddress" TEXT,
ADD COLUMN "onChainNetwork" TEXT,
ADD COLUMN "onChainChainId" INTEGER,
ADD COLUMN "onChainBlockNumber" INTEGER,
ADD COLUMN "onChainConfirmationStatus" TEXT,
ADD COLUMN "onChainConfirmedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Listing_onChainListingId_key" ON "Listing"("onChainListingId");
CREATE UNIQUE INDEX "Listing_onChainTxHash_key" ON "Listing"("onChainTxHash");
CREATE UNIQUE INDEX "Listing_onChainIdempotencyKey_key" ON "Listing"("onChainIdempotencyKey");
