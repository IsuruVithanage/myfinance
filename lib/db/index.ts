import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * One pool per warm lambda. Neon's *pooled* connection string (the one with
 * `-pooler` in the host) already fronts pgbouncer, so we keep max low and let
 * Neon do the pooling.
 */
const globalForDb = globalThis as unknown as {
  __pool?: Pool;
  __db?: NodePgDatabase<typeof schema>;
};

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const local =
    connectionString.includes("sslmode=disable") ||
    connectionString.includes("@localhost") ||
    connectionString.includes("@127.0.0.1");

  /**
   * Drop `sslmode` from the URL. The explicit `ssl` option below already wins
   * over it in `pg`, so leaving both in place only makes it ambiguous which one
   * is in force — and `pg` warns that the string's semantics will change in a
   * future major version.
   */
  let cleaned = connectionString;
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    cleaned = url.toString();
  } catch {
    // Not URL-shaped; hand it to pg untouched and let pg complain.
  }

  return new Pool({
    connectionString: cleaned,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    /**
     * Verify the server certificate for anything off-box. `pg` lets an explicit
     * `ssl` option override the connection string, so passing
     * `rejectUnauthorized: false` here would silently disable verification and
     * leave the connection open to interception — not acceptable for a database
     * holding financial records. `true` verifies the chain and the hostname
     * against the system CAs, which Neon's certificate satisfies.
     */
    ssl: local ? false : true,
  });
}

function getPool(): Pool {
  globalForDb.__pool ??= createPool();
  return globalForDb.__pool;
}

function getDb(): NodePgDatabase<typeof schema> {
  globalForDb.__db ??= drizzle(getPool(), { schema, casing: "snake_case" });
  return globalForDb.__db;
}

/**
 * Both handles are built on first *use*, never on import.
 *
 * `next build` executes these modules while collecting route data, so eagerly
 * constructing a pool turns a missing DATABASE_URL into an opaque "failed to
 * collect page data" build error. Deferring it means a misconfigured
 * environment surfaces as a clear message on the page that needed the
 * database, and the build itself still succeeds.
 *
 * Methods are bound to the real instance rather than the proxy, so anything
 * relying on `this` inside `pg` or Drizzle behaves normally.
 */
function lazyHandle<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = resolve() as Record<string | symbol, unknown>;
      const value = instance[prop];
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has(_target, prop) {
      return prop in (resolve() as object);
    },
  });
}

export const pool = lazyHandle(getPool);
export const db = lazyHandle(getDb);

export { schema };
export type Db = NodePgDatabase<typeof schema>;
