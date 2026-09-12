# MyFinance

A single-user finance app: multiple accounts in **LKR and USD**, credit cards with
due-date alerts, money lent and borrowed, transaction fees, and categorised
spending and income. Mobile-first, installable as a PWA, deployable free.

---

## How the money model works

Everything is one table of **postings** that must add up to zero. A transaction
owns two or more postings; each posting touches **either** an account **or** a
category, never both.

| What you did | The postings |
|---|---|
| Groceries with cash | `Wallet −4,500` · `Groceries +4,500` |
| Bank transfer with a fee | `BankA −10,055` · `BankB +10,000` · `Bank Fees +55` |
| Card purchase | `Card −2,500` · `Dining +2,500` |
| Paying the card bill | `Bank −30,000` · `Card +30,000` — not a new expense |
| Lending Kamal 5,000 | `Wallet −5,000` · `Kamal (owes me) +5,000` — not an expense |
| Borrowing 20,000 | `Bank +20,000` · `Nimal (I owe) −20,000` — not income |
| Selling USD 100 at 300 | `USD −100` · `Bank +29,850` · `Bank Fees +150` |

Because of that single rule:

- **Balance** of any account = opening balance + every posting that touched it.
- **Liabilities are negative.** A card at `−45,000` means you owe 45,000, so net
  worth is a plain `SUM` over every account.
- **Lending is not spending.** The money is still yours, it just moved into a
  receivable. Only interest ever hits a category.
- **Fees are visible.** Every fee is its own posting against a real category, so
  you can see exactly what your bank charged you this year.

Amounts are stored as **integers in cents** — never floats.

### Two currencies, honestly

Each account holds exactly one currency. The split that matters:

- **Balances and net worth** are converted at **today's** rate. A USD account you
  still hold is worth today's rate, not a blend of every rate you ever used.
- **Income and expense reports** use the rate **at the time of the transaction**,
  stored on each posting. Changing today's rate never rewrites last month's
  spending.
- An **exchange** records what left and what arrived; the rate you actually got
  is implied by those two numbers, not by a published mid-market figure.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Database | Neon — serverless Postgres, free tier |
| ORM | Drizzle + drizzle-kit migrations |
| Auth | Auth.js v5, Google OAuth, hard email allowlist |
| UI | Tailwind CSS v4, lucide icons, Recharts |
| Hosting | Vercel Hobby (free) |
| Backups | GitHub Actions → nightly `pg_dump` into this repo |

---

## Setup

### 1. Database (Neon)

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (the host contains `-pooler`).

### 2. Google sign-in

1. Google Cloud Console → **APIs & Services → Credentials → OAuth client ID → Web**.
2. Authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-APP.vercel.app/api/auth/callback/google`

### 3. Environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and your own
address in `ALLOWED_EMAILS`. Generate the secret with:

```bash
npx auth secret
```

### 4. Install, migrate, seed

```bash
npm install && npm run db:migrate && npm run seed
```

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>. For local work without Google OAuth, set
`ALLOW_DEV_LOGIN="1"` in `.env` — it is refused in any production build.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — the defaults are correct.
3. Add the environment variables from `.env.example` in **Project → Settings →
   Environment Variables** (leave `ALLOW_DEV_LOGIN` unset).
4. Set `AUTH_URL` to your deployed URL, e.g. `https://myfinance.vercel.app`.
5. Deploy, then add your production callback URL to the Google OAuth client.

Run migrations against production whenever the schema changes:

```bash
DATABASE_URL="<neon-url>" npm run db:migrate
```

### Install it on your phone

Open the deployed site in Safari or Chrome and choose **Add to Home Screen**. It
runs full-screen with its own icon and shows a clear offline notice rather than
a stale balance.

---

## Backups

Three independent layers, all free:

1. **Neon** keeps point-in-time restore on its free tier.
2. **`.github/workflows/backup.yml`** dumps the database into `backups/` nightly
   and keeps the last 30 days. Add `DATABASE_URL` as a repository secret to turn
   it on.
3. **Settings → Your data** exports a full JSON backup or a CSV of every posting,
   on demand.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
| `npm run seed` | Settings, default categories, opening FX rate |
| `npx tsx scripts/verify-ledger.ts` | **Wipes transactional data**, then replays every transaction type and asserts balances, invariants and reports |

`verify-ledger` is the safety net: run it against a scratch database after any
change to `lib/ledger.ts`.

---

## Layout

```
app/
  (app)/            signed-in screens — dashboard, add, accounts, cards,
                    people, transactions, reports, settings
  signin/           sign-in page
  api/auth/         Auth.js handler
  api/export/       JSON + CSV export
lib/
  db/schema.ts      tables, enums, relations
  ledger.ts         the only place postings are written
  queries.ts        every read the UI does
  cards.ts          statement cycle and due-date maths
  fx.ts             rate lookup and conversion
  money.ts          minor units, parsing, one formatter
  notifications.ts  regenerates the in-app alert inbox
  actions.ts        server actions (all mutations)
components/         UI, client-side where it needs to be
scripts/            seed and ledger verification
```

### Adding a new kind of transaction

Add a builder in `lib/ledger.ts` that returns balanced postings, expose it in
`lib/actions.ts`, give it a mode in `components/QuickAdd.tsx`, and describe it in
`lib/txn-display.ts`. Then extend `scripts/verify-ledger.ts` with a case that
asserts the resulting balances.
