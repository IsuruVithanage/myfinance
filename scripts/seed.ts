import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { categories, fxRates, settings } from "../lib/db/schema";

/** name, icon, colour, isSystem */
const EXPENSE: Array<[string, string, string, boolean?]> = [
  ["Groceries", "shopping-basket", "#16a34a"],
  ["Dining Out", "utensils", "#f97316"],
  ["Transport", "bus", "#0ea5e9"],
  ["Fuel", "fuel", "#ef4444"],
  ["Rent", "home", "#8b5cf6"],
  ["Utilities", "zap", "#eab308"],
  ["Internet & Phone", "wifi", "#06b6d4"],
  ["Health", "heart-pulse", "#ec4899"],
  ["Education", "graduation-cap", "#3b82f6"],
  ["Shopping", "shopping-bag", "#a855f7"],
  ["Entertainment", "clapperboard", "#f43f5e"],
  ["Subscriptions", "repeat", "#6366f1"],
  ["Travel", "plane", "#14b8a6"],
  ["Household", "sofa", "#84cc16"],
  ["Personal Care", "scissors", "#d946ef"],
  ["Gifts & Donations", "gift", "#fb7185"],
  ["Insurance", "shield", "#475569"],
  ["Taxes", "landmark", "#78716c"],
  ["Bank Fees", "receipt", "#dc2626", true],
  ["Interest Paid", "percent", "#b91c1c", true],
  ["FX Difference", "arrow-left-right", "#94a3b8", true],
  ["Adjustment", "sliders-horizontal", "#94a3b8", true],
  ["Uncategorised", "circle-help", "#94a3b8", true],
];

const INCOME: Array<[string, string, string, boolean?]> = [
  ["Salary", "briefcase", "#10b981"],
  ["Freelance", "laptop", "#22c55e"],
  ["Bonus", "sparkles", "#4ade80"],
  ["Investment Returns", "trending-up", "#0d9488"],
  ["Interest Income", "percent", "#059669", true],
  ["Refunds", "undo-2", "#65a30d"],
  ["Gifts Received", "gift", "#34d399"],
  ["Other Income", "circle-plus", "#94a3b8", true],
];

async function main() {
  console.log("→ settings");
  await db
    .insert(settings)
    .values({ id: 1, baseCurrency: "LKR", fallbackUsdLkr: "305", locale: "en-LK" })
    .onConflictDoNothing();

  console.log("→ categories");
  const rows = [
    ...EXPENSE.map(([name, icon, color, isSystem], i) => ({
      name,
      kind: "expense" as const,
      icon,
      color,
      isSystem: !!isSystem,
      sortOrder: i,
    })),
    ...INCOME.map(([name, icon, color, isSystem], i) => ({
      name,
      kind: "income" as const,
      icon,
      color,
      isSystem: !!isSystem,
      sortOrder: i,
    })),
  ];

  const existing = await db.select({ name: categories.name }).from(categories);
  const have = new Set(existing.map((e) => e.name));
  const toInsert = rows.filter((r) => !have.has(r.name));
  if (toInsert.length) await db.insert(categories).values(toInsert);
  console.log(`   ${toInsert.length} added, ${have.size} already present`);

  console.log("→ opening USD→LKR rate");
  await db
    .insert(fxRates)
    .values({
      date: new Date().toISOString().slice(0, 10),
      base: "USD",
      quote: "LKR",
      rate: "305",
      source: "manual",
    })
    .onConflictDoNothing();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(categories);
  console.log(`✓ seed complete — ${count} categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
