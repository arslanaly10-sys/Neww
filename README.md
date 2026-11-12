# ZMNHOOF OS (concept demo)

Real estate intelligence, human conviction. A working demo for ZMNHOOF built to show three things: the data is traceable, the AI shows its working, and the system is governed.

**Everything in this app is synthetic sample data.** No real client, tenant, valuation or CAPMAS/CBE figure appears anywhere. Every screen carries a "Sample" ribbon, and headline numbers open a panel with their source and assumption set.

## Status

All 5 stages complete. Stage 1: shell, brand, English/Arabic with true RTL, roles, deterministic seed data, schema with row-level security. Stage 2: portfolio workspace (scrubbable 36-month chart, net yield, allocation, sortable holdings, schematic map with district heat, updates feed) and full asset detail (value against cost, income and costs, tenant and lease, documents, valuation history, deterministic risk panel). Stage 3: deterministic valuation engine (range, confidence, driver breakdown, five comparables, versioned assumptions), human adjustment with a mandatory reason, review queue with separation of duties and two approvers above a 10% adjustment, command bar with question hand-off, and Horus, the cited AI analyst. Stage 4: scenario engine (live sliders, low/central/high cases, saved and reproducible scenarios, versioned assumption register), document intelligence (three bundled sample PDFs, per-field confidence and source lines, confirmation before any record changes, missing/expiring flags) and the bilingual investor pack PDF with an audit appendix and verification hash. Stage 5: alerts (lease renewal, missing document, valuation drift, vacancy cost) with snooze-with-reason, a unified approvals queue, the governance audit log with Verify chain and a clearly labelled admin tamper demo, a simulated live feed over SSE, error/404 pages, and Postgres driver switching (PGlite, Neon, node-postgres). See `docs/known-gaps.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000, redirects to /en
```

No database setup is needed. Without `DATABASE_URL` the app boots an embedded PostgreSQL (PGlite), applies the migration and RLS policies, and seeds the same sample dataset every time.

```bash
npm run build && npm start     # production build
npm test                       # unit tests: seed golden values, RLS, audit chain, permissions, formatting
npm run check:browser          # stage 1 real-browser checks (app running on :3100), EN, AR, 390px
npm run check:stage2           # stage 2 checks: chart scrubbing, sorting, map, role visibility
npm run check:stage3           # stage 3 checks (restart the app first: the check changes data in memory)
npm run check:stage4           # stage 4 checks: scenarios, documents, pack (restart the app first)
npm run check:stage5           # stage 5 checks: alerts, approvals, audit chain, live feed (restart the app first)
node scripts/make-sample-pdfs.mjs   # regenerates the three sample PDFs and their hash manifest
npm run check:a11y             # axe-core WCAG 2.1 AA scan
```

The browser scripts expect Chromium at `/opt/pw-browsers/chromium`; set `CHROME` to use another path.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | Neon / PostgreSQL connection string. Set it on Vercel; the schema and seed are applied on first boot. | unset: embedded PGlite |
| `SESSION_SECRET` | Signs the demo session cookie. | demo value, set your own on Vercel |
| `ZOS_FEED_INTERVAL_MS` | Simulated feed cadence (tests only). | 20-40 s random |
| `DB_DRIVER`, `DB_POOL_MAX` | Force `pg` / pool size (used by the wire-protocol test). | auto from URL |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Horus. Without a key, or past 20 questions per hour, or on any model error, Horus answers from the scripted path and says so. All model calls go through `src/lib/horus/gateway.ts`. | unset, `claude-sonnet-5-5` |

## Demo users

Sign-in is a role picker, not authentication. Investor (Karim Fahmy), Asset managers (Nour Abdelrahman, Omar Saleh), Administrator (Salma Rashed). All fictional.

## Layout

`src/db` schema, migration, RLS policies, seed. `src/lib` permissions, hashing, assumptions, formatting, access layer. `src/app/[locale]` pages. `messages/` English and Arabic copy. `docs/` architecture note, known gaps, stage screenshots.

Proprietary. All rights reserved. Private repository.
