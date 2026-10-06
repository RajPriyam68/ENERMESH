-- Trade mapping for verified EnergyPurchased / TradeSettled ids.
ALTER TABLE "Trade" ADD COLUMN "onChainListingId" TEXT,
ADD COLUMN "onChainTradeId" TEXT;

CREATE INDEX "Trade_matchId_idx" ON "Trade"("matchId");

-- Listing quantity identity. PostgreSQL allows multiple NULLs; decimals compare exactly.
ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_quantity_nonneg"
  CHECK ("availableQuantityKwh" >= 0 AND "soldQuantityKwh" >= 0 AND "originalQuantityKwh" > 0);

ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_quantity_identity"
  CHECK ("availableQuantityKwh" + "soldQuantityKwh" = "originalQuantityKwh");
