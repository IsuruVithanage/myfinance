CREATE TYPE "public"."account_type" AS ENUM('cash', 'bank', 'savings', 'credit_card', 'wallet', 'investment', 'receivable', 'payable');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('LKR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('info', 'warn', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."txn_type" AS ENUM('expense', 'income', 'transfer', 'exchange', 'lend', 'collect', 'borrow', 'settle', 'adjustment');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" "currency" NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"institution" text,
	"last4" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"icon" text DEFAULT 'wallet' NOT NULL,
	"counterparty_id" integer,
	"include_in_net_worth" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_details" (
	"account_id" integer PRIMARY KEY NOT NULL,
	"credit_limit_minor" bigint DEFAULT 0 NOT NULL,
	"statement_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"due_month_offset" integer DEFAULT 1 NOT NULL,
	"min_payment_pct" numeric(5, 2) DEFAULT '5' NOT NULL,
	"apr_bp" integer DEFAULT 0 NOT NULL,
	"alert_days_before" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"parent_id" integer,
	"icon" text DEFAULT 'tag' NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"monthly_budget_minor" bigint DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"base" "currency" DEFAULT 'USD' NOT NULL,
	"quote" "currency" DEFAULT 'LKR' NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" "severity" DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"dedupe_key" text NOT NULL,
	"href" text,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"account_id" integer,
	"category_id" integer,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"memo" text,
	CONSTRAINT "posting_targets_exactly_one" CHECK (("postings"."account_id" IS NOT NULL)::int + ("postings"."category_id" IS NOT NULL)::int = 1),
	CONSTRAINT "posting_amount_nonzero" CHECK ("postings"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"base_currency" "currency" DEFAULT 'LKR' NOT NULL,
	"fallback_usd_lkr" numeric(18, 6) DEFAULT '300' NOT NULL,
	"locale" text DEFAULT 'en-LK' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"type" "txn_type" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"note" text,
	"counterparty_id" integer,
	"fx_rate" numeric(18, 8),
	"expected_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_details" ADD CONSTRAINT "card_details_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_type_idx" ON "accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "accounts_counterparty_idx" ON "accounts" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "categories_kind_idx" ON "categories" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_unique" ON "fx_rates" USING btree ("date","base","quote");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "postings_txn_idx" ON "postings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "postings_account_idx" ON "postings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "postings_category_idx" ON "postings" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_counterparty_idx" ON "transactions" USING btree ("counterparty_id");