ALTER TABLE "categories" ADD COLUMN "monthly_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Start the obvious once-a-month costs as monthly-only; each can be toggled.
UPDATE "categories" SET "monthly_only" = true
WHERE "kind" = 'expense'
  AND "name" IN ('Rent', 'Utilities', 'Internet & Phone', 'Subscriptions',
                 'Gifts', 'Gifts & Donations', 'Insurance', 'Taxes', 'Interest Paid');
