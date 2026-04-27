-- Fix VariationOrder.contractId foreign key: Contract model is mapped to "JobContract" table.
-- Previous migration attempted to reference "Contract" table which doesn't exist.

DO $$ BEGIN
  ALTER TABLE "VariationOrder"
    ADD CONSTRAINT "VariationOrder_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

