CREATE TYPE "public"."budget_period" AS ENUM('weekly', 'monthly');--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "budget_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "budget_period" "budget_period" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
UPDATE "categories" SET "budget_minor" = "monthly_budget_minor" WHERE "monthly_budget_minor" > 0;
