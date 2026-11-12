# Architecture note: demo layer to production equivalent

| Layer | In this demo | In production |
| --- | --- | --- |
| Identity | Role picker, HMAC-signed httpOnly cookie | SSO (OIDC/SAML), MFA, SCIM-managed roles |
| Authorisation | One permission map (`src/lib/permissions.ts`) drives code and the Governance matrix; PostgreSQL RLS enforces rows | Same map, plus column-level views and policy tests in CI |
| Database | PGlite locally, Neon PostgreSQL on Vercel, same Drizzle schema and RLS SQL | Managed PostgreSQL with PITR, read replicas, RLS unchanged |
| Data | Deterministic synthetic seed (30 assets, 400 sales, 36-month series) | Ingestion from registries, brokers, bank and property-management systems, with lineage |
| Assumptions | Versioned, SHA-256-hashed sets in `assumption_sets` | Same, with approval workflow and release notes |
| Audit | Hash-chained `audit_events`, append-only by policy | Same chain, written by a SECURITY DEFINER function, anchored externally |
| Valuation | Deterministic TypeScript hedonic model, versioned hashed assumptions, comparable-sales cross-check, two-person confirmation | Same engine and register, calibrated on real transactions, with model risk governance and back-testing |
| AI (Horus) | One server-side gateway; the model calls deterministic tools under the user's row-level security; every claim needs a citation id a tool returned and every number must come from a tool; scripted fallback | Same gateway with evals, prompt/version registry, cost controls, streaming and server-side refusal fallbacks |
| Scenarios | Pure TypeScript engine, sample coefficients in a versioned hashed register, saved with input, set version, data hash and result hash | Same engine and register, coefficients calibrated and approved by a risk committee, results stored as immutable runs |
| Documents | Rule-based reader for three bundled sample PDFs, confidence per field, human confirmation before any record changes | OCR and model extraction with a review queue, document store, retention and legal-hold rules |
| Investor pack | react-pdf server-side, English and Arabic, content hash bound to the audit chain head, issue register | Same, plus signed PDFs, a branded template system and delivery through a secure portal |
| Alerts and approvals | Pure rule engine (`ALERT_ASSUMPTIONS`), snooze needs a reason, one approvals queue over valuations, documents, update drafts and role changes, separation of duties | Same rules as configuration, notification channels, escalation and SLAs |
| Chain verification | Verify chain recomputes every SHA-256 link and names the first broken event; admin-only labelled tamper demo | Scheduled verification, external anchoring, no tamper action |
| Live feed | Simulated events over SSE, role-filtered, never stored | Events from the ledger and property-management systems via a queue |
| Database drivers | PGlite, Neon serverless, or node-postgres chosen from the URL; provisioning in one transaction under an advisory lock | Migrations through CI, no runtime provisioning |
| i18n | next-intl, `/en` and `/ar`, true RTL, Western digits | Same, with a managed translation workflow |
| Hosting | Vercel | Vercel or a regional cloud, depending on data-residency requirements |

Principles: the model never does arithmetic or decides; every number links to source rows and an assumption set; synthetic data is labelled wherever it appears.
