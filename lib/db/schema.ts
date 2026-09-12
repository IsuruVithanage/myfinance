import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  bigint,
  boolean,
  date,
  timestamp,
  numeric,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ────────────────────────────── enums ────────────────────────────── */

export const currencyEnum = pgEnum("currency", ["LKR", "USD"]);

export const accountTypeEnum = pgEnum("account_type", [
  "cash", // physical money in your wallet
  "bank", // current / savings account
  "savings",
  "credit_card", // liability
  "wallet", // digital wallet (eZ Cash, FriMi, PayPal…)
  "investment",
  "receivable", // money someone owes you  (auto-created per person)
  "payable", // money you owe someone     (auto-created per person)
]);

export const categoryKindEnum = pgEnum("category_kind", ["expense", "income"]);

export const txnTypeEnum = pgEnum("txn_type", [
  "expense",
  "income",
  "transfer", // between your own accounts, same currency
  "exchange", // between your own accounts, across currencies
  "lend", // you give money to a person      → receivable up
  "collect", // that person pays you back       → receivable down
  "borrow", // a person gives you money        → payable up
  "settle", // you pay that person back        → payable down
  "adjustment", // reconcile a drifted balance
]);

export const severityEnum = pgEnum("severity", ["info", "warn", "urgent"]);

/* ───────────────────────────── settings ──────────────────────────── */
/** Single-row table (id = 1). Holds app-wide preferences. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  baseCurrency: currencyEnum("base_currency").notNull().default("LKR"),
  /** Fallback USD→LKR rate used when no dated rate exists. */
  fallbackUsdLkr: numeric("fallback_usd_lkr", { precision: 18, scale: 6 })
    .notNull()
    .default("300"),
  locale: text("locale").notNull().default("en-LK"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─────────────────────────── counterparties ──────────────────────── */
/** People you lend to or borrow from. */
export const counterparties = pgTable("counterparties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/* ───────────────────────────── accounts ──────────────────────────── */
/**
 * Every place money can sit — including one auto-created `receivable` /
 * `payable` account per person, so lending is just a transfer.
 *
 * Sign convention: balance is ALWAYS "what it is worth to you".
 *   asset accounts    → positive
 *   credit_card       → negative when you owe (−45,000 means you owe 45,000)
 *   payable           → negative when you owe
 *   receivable        → positive when someone owes you
 * Net worth is therefore a plain SUM over every account balance.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    currency: currencyEnum("currency").notNull(),
    /** Balance before the first recorded transaction, in minor units (cents). */
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" })
      .notNull()
      .default(0),
    institution: text("institution"),
    last4: text("last4"),
    color: text("color").notNull().default("#6366f1"),
    icon: text("icon").notNull().default("wallet"),
    /** Set only for receivable / payable accounts. */
    counterpartyId: integer("counterparty_id").references(
      () => counterparties.id,
      { onDelete: "cascade" },
    ),
    /** Excluded from net worth when false (e.g. a tracking-only account). */
    includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("accounts_type_idx").on(t.type),
    index("accounts_counterparty_idx").on(t.counterpartyId),
  ],
);

/* ──────────────────────── credit card details ────────────────────── */
export const cardDetails = pgTable("card_details", {
  accountId: integer("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  creditLimitMinor: bigint("credit_limit_minor", { mode: "number" })
    .notNull()
    .default(0),
  /** Day of month the statement closes (1–31, clamped to month length). */
  statementDay: integer("statement_day").notNull(),
  /** Day of month the payment is due (1–31, clamped). */
  dueDay: integer("due_day").notNull(),
  /** How many months after statement close the due day falls (usually 1). */
  dueMonthOffset: integer("due_month_offset").notNull().default(1),
  minPaymentPct: numeric("min_payment_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("5"),
  /** Annual rate in basis points (e.g. 2400 = 24 %). */
  aprBp: integer("apr_bp").notNull().default(0),
  /** Alert this many days before the due date. */
  alertDaysBefore: integer("alert_days_before").notNull().default(7),
});

/* ──────────────────────────── categories ─────────────────────────── */
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull(),
    parentId: integer("parent_id"),
    icon: text("icon").notNull().default("tag"),
    color: text("color").notNull().default("#64748b"),
    /** Monthly budget in BASE currency minor units. 0 = no budget. */
    monthlyBudgetMinor: bigint("monthly_budget_minor", { mode: "number" })
      .notNull()
      .default(0),
    /** System categories (Bank Fees, FX Difference…) cannot be deleted. */
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("categories_kind_idx").on(t.kind)],
);

/* ─────────────────────────── transactions ────────────────────────── */
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    type: txnTypeEnum("type").notNull(),
    description: text("description").notNull().default(""),
    note: text("note"),
    counterpartyId: integer("counterparty_id").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),
    /**
     * Only for `exchange`: units of the TO currency per 1 unit of the FROM
     * currency, exactly as the bank gave it to you. Stored for the record —
     * reporting uses the posting-level base amounts.
     */
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
    /** When a lent/borrowed amount is expected back. Drives reminders. */
    expectedOn: date("expected_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_type_idx").on(t.type),
    index("transactions_counterparty_idx").on(t.counterpartyId),
  ],
);

/* ───────────────────────────── postings ──────────────────────────── */
/**
 * The ledger. Each transaction owns 2+ postings; each posting touches EITHER
 * an account OR a category, never both.
 *
 * Invariants enforced in lib/ledger.ts on every write:
 *   • SUM(base_amount_minor) = 0 for every transaction
 *   • SUM(amount_minor) = 0 too, unless type = 'exchange'
 *
 * Signs: + adds to the account / consumes into an expense category.
 *        − removes from the account / originates from an income category.
 *
 * A transfer of LKR 10,000 costing a LKR 55 fee is three postings:
 *   BankA −10,055 | BankB +10,000 | category:Bank Fees +55   → sums to 0
 */
export const postings = pgTable(
  "postings",
  {
    id: serial("id").primaryKey(),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    accountId: integer("account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    /** Signed amount in THIS posting's own currency, minor units. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    /** Same amount converted to the base currency at the transaction's rate. */
    baseAmountMinor: bigint("base_amount_minor", { mode: "number" }).notNull(),
    memo: text("memo"),
  },
  (t) => [
    index("postings_txn_idx").on(t.transactionId),
    index("postings_account_idx").on(t.accountId),
    index("postings_category_idx").on(t.categoryId),
    check(
      "posting_targets_exactly_one",
      sql`(${t.accountId} IS NOT NULL)::int + (${t.categoryId} IS NOT NULL)::int = 1`,
    ),
    check("posting_amount_nonzero", sql`${t.amountMinor} <> 0`),
  ],
);

/* ──────────────────────────── fx rates ───────────────────────────── */
/** USD→LKR history, so past transactions keep the rate you actually got. */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    base: currencyEnum("base").notNull().default("USD"),
    quote: currencyEnum("quote").notNull().default("LKR"),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: text("source").notNull().default("manual"),
  },
  (t) => [uniqueIndex("fx_rates_unique").on(t.date, t.base, t.quote)],
);

/* ────────────────────────── notifications ────────────────────────── */
/** In-app alert inbox. Recomputed on load; `dedupeKey` stops repeats. */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // card_due | card_utilization | budget_over | loan_overdue | …
    severity: severityEnum("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** Stable identity for one alert occurrence, e.g. "card_due:3:2026-09" */
    dedupeKey: text("dedupe_key").notNull(),
    href: text("href"),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey),
    index("notifications_unread_idx").on(t.readAt),
  ],
);

/* ──────────────────────────── relations ──────────────────────────── */

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  counterparty: one(counterparties, {
    fields: [accounts.counterpartyId],
    references: [counterparties.id],
  }),
  card: one(cardDetails, {
    fields: [accounts.id],
    references: [cardDetails.accountId],
  }),
  postings: many(postings),
}));

export const cardDetailsRelations = relations(cardDetails, ({ one }) => ({
  account: one(accounts, {
    fields: [cardDetails.accountId],
    references: [accounts.id],
  }),
}));

export const counterpartiesRelations = relations(
  counterparties,
  ({ many }) => ({
    accounts: many(accounts),
    transactions: many(transactions),
  }),
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_parent",
  }),
  children: many(categories, { relationName: "category_parent" }),
  postings: many(postings),
}));

export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    postings: many(postings),
    counterparty: one(counterparties, {
      fields: [transactions.counterpartyId],
      references: [counterparties.id],
    }),
  }),
);

export const postingsRelations = relations(postings, ({ one }) => ({
  transaction: one(transactions, {
    fields: [postings.transactionId],
    references: [transactions.id],
  }),
  account: one(accounts, {
    fields: [postings.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [postings.categoryId],
    references: [categories.id],
  }),
}));

/* ──────────────────────────── inferred types ─────────────────────── */

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type CardDetail = typeof cardDetails.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Counterparty = typeof counterparties.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Posting = typeof postings.$inferSelect;
export type NewPosting = typeof postings.$inferInsert;
export type FxRate = typeof fxRates.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Currency = (typeof currencyEnum.enumValues)[number];
export type AccountType = (typeof accountTypeEnum.enumValues)[number];
export type TxnType = (typeof txnTypeEnum.enumValues)[number];
