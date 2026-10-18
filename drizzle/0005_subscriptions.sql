CREATE TYPE "public"."subscription_cycle" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" DEFAULT 'LKR' NOT NULL,
	"cycle" "subscription_cycle" DEFAULT 'monthly' NOT NULL,
	"next_date" date NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"account_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;