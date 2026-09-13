import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { db, pool } from "../lib/db";
import { TABLES } from "./tables";

/**
 * A logical backup: every row of every table, as JSON.
 *
 * Deliberately not pg_dump. That tool refuses to dump a server newer than
 * itself, so a backup pinned to a client version silently starts failing the
 * day the provider upgrades Postgres underneath you — which is precisely when
 * you would not notice. This only needs Node, which the restore path needs
 * anyway, so it cannot drift out of step with the server.
 *
 * Restore with: npx tsx scripts/restore.ts <file>
 */

async function main() {
  const out =
    process.argv[2] ??
    join("backups", `myfinance-${new Date().toISOString().slice(0, 10)}.json`);

  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const { name, table } of TABLES) {
    const rows = await db.select().from(table);
    data[name] = rows;
    counts[name] = rows.length;
  }

  const payload = {
    app: "myfinance",
    formatVersion: 1,
    takenAt: new Date().toISOString(),
    counts,
    data,
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2));

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`wrote ${out}`);
  for (const [name, n] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(16)} ${String(n).padStart(6)}`);
  }
  console.log(`  ${"total".padEnd(16)} ${String(total).padStart(6)} rows`);

  // A backup with no ledger in it is a red flag worth failing on, so a broken
  // credential or an empty database never quietly overwrites a good backup.
  if (counts.postings === 0 && counts.transactions > 0) {
    console.error("\nRefusing: transactions exist but no postings were read.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
