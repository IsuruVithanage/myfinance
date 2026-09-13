ALTER TABLE "settings" ADD COLUMN "weekly_budget_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "monthly_budget_minor" bigint DEFAULT 0 NOT NULL;