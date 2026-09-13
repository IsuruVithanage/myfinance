import {
  accounts,
  cardDetails,
  categories,
  counterparties,
  fxRates,
  notifications,
  postings,
  settings,
  transactions,
} from "../lib/db/schema";

/**
 * Every table, in insert order: parents before the rows that reference them.
 * Restore walks this list backwards to clear out.
 *
 * Lives in its own module with no side effects. Importing it from a script
 * that also has a `main()` would run that script — which is how a restore can
 * silently overwrite the very backup it is about to read.
 */
export const TABLES = [
  { name: "settings", table: settings },
  { name: "counterparties", table: counterparties },
  { name: "categories", table: categories },
  { name: "accounts", table: accounts },
  { name: "cardDetails", table: cardDetails },
  { name: "transactions", table: transactions },
  { name: "postings", table: postings },
  { name: "fxRates", table: fxRates },
  { name: "notifications", table: notifications },
] as const;
