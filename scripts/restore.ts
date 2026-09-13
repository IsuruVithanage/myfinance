import "dotenv/config";
import { readFileSync } from "node:fs";
import { getTableName, sql } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { TABLES } from "./tables";

/**
 * Restore a backup produced by scripts/backup.ts.
 *
 * The target must already have the schema — run `npm run db:migrate` first.
 * This replaces every row, so it refuses to touch a database that already
 * holds transactions unless you say so explicitly.
 *
 *   npm run db:migrate
 *   npx tsx scripts/restore.ts backups/myfinance-2026-09-13.json
 */

/** Columns Postgres hands back as timestamps; JSON turns them into strings. */
const TIMESTAMP_COLUMNS: Record<string, string[]> = {
  settings: ["updatedAt"],
  counterparties: ["createdAt", "archivedAt"],
  categories: ["archivedAt"],
  accounts: ["createdAt"],
  transactions: ["createdAt", "updatedAt"],
  notifications: ["createdAt", "readAt", "dismissedAt"],
};

function reviveDates(tableName: string, row: Record<string, unknown>) {
  for (const column of TIMESTAMP_COLUMNS[tableName] ?? []) {
    const value = row[column];
    if (typeof value === "string") row[column] = new Date(value);
  }
  return row;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/restore.ts <backup.json>");
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(file, "utf8"));
  if (payload.app !== "myfinance") {
    console.error("That file is not a MyFinance backup.");
    process.exit(1);
  }

  const [existing] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from transactions`,
  ).then((r) => (r as unknown as { rows: { n: number }[] }).rows ?? (r as unknown as { n: number }[]));

  if (existing && existing.n > 0 && process.env.OVERWRITE !== "yes") {
    console.error(
      `\n  Refusing: the target already holds ${existing.n} transactions.\n` +
        `  Restoring would replace them. If that is what you want:\n` +
        `    OVERWRITE=yes npx tsx scripts/restore.ts ${file}\n`,
    );
    process.exit(1);
  }

  console.log(`restoring ${file} (taken ${payload.takenAt})`);

  await db.transaction(async (tx) => {
    // Children first, so foreign keys never block the clear-out.
    for (const { table } of [...TABLES].reverse()) {
      await tx.delete(table);
    }

    for (const { name, table } of TABLES) {
      const rows: Record<string, unknown>[] = payload.data[name] ?? [];
      if (rows.length === 0) continue;
      await tx
        .insert(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(rows.map((r) => reviveDates(name, { ...r })) as any);
      console.log(`  ${name.padEnd(16)} ${String(rows.length).padStart(6)}`);
    }

    /**
     * Restoring explicit ids leaves every sequence behind, so the next insert
     * would collide with a restored row. Discover sequences from the catalogue
     * rather than assuming each table has an `id` — card_details is keyed by
     * account_id, and guessing would silently skip or crash on tables like it.
     */
    await tx.execute(sql`
      do $$
      declare r record;
      begin
        for r in
          select s.relname as seq, t.relname as tbl, a.attname as col
          from pg_class s
          join pg_depend d
            on d.objid = s.oid
           and d.classid = 'pg_class'::regclass
           and d.refclassid = 'pg_class'::regclass
          join pg_class t on t.oid = d.refobjid
          join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
          where s.relkind = 'S' and t.relnamespace = 'public'::regnamespace
        loop
          execute format(
            'select setval(%L, coalesce((select max(%I) from %I), 0) + 1, false)',
            r.seq, r.col, r.tbl
          );
        end loop;
      end $$;
    `);
  });

  console.log("restore complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
