-- Split proposal follow-up reminders into explicit first and second reminder states.
-- Existing generic REMINDER entries are preserved as REMINDER_1.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'ProposalActivityType'
      AND e.enumlabel = 'REMINDER'
  ) THEN
    ALTER TYPE "ProposalActivityType" RENAME TO "ProposalActivityType_old";
    CREATE TYPE "ProposalActivityType" AS ENUM ('SENT', 'VIEWED', 'REMINDER_1', 'REMINDER_2', 'APPROVED');

    UPDATE "ProposalActivity"
    SET "type" = 'REMINDER_1'::"ProposalActivityType_old"
    WHERE "type" = 'REMINDER'::"ProposalActivityType_old";

    ALTER TABLE "ProposalActivity"
      ALTER COLUMN "type" TYPE "ProposalActivityType"
      USING ("type"::text::"ProposalActivityType");

    DROP TYPE "ProposalActivityType_old";
  END IF;
END $$;
