import {
  pgTable,
  text,
  integer,
  bigint,
  numeric,
  date,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/**
 * ZMNHOOF OS schema. Plain PostgreSQL: runs on PGlite locally and Neon in production.
 * Row-level security policies live in src/db/rls.sql and use the session setting
 * app.role / app.user_id, set per request by withSession() in src/db/client.ts.
 * All money is stored as whole EGP (bigint). Every row is SAMPLE DATA.
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(), // investor | manager | admin
  title: text("title").notNull(),
  titleAr: text("title_ar").notNull(),
});

export const districts = pgTable("districts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  lat: numeric("lat", { precision: 9, scale: 5 }).notNull(),
  lng: numeric("lng", { precision: 9, scale: 5 }).notNull(),
  basePpsqm: integer("base_ppsqm").notNull(), // sample EGP per sqm, synthetic
});

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(), // e.g. A-001
    name: text("name").notNull(),
    nameAr: text("name_ar").notNull(),
    districtId: text("district_id").notNull().references(() => districts.id),
    type: text("type").notNull(), // apartment | villa | office | retail | land | mixed
    compound: text("compound").notNull(),
    areaSqm: integer("area_sqm").notNull(),
    floor: integer("floor"),
    finish: text("finish").notNull(),
    yearBuilt: integer("year_built"),
    acquiredOn: date("acquired_on").notNull(),
    costEgp: bigint("cost_egp", { mode: "number" }).notNull(),
    valueEgp: bigint("value_egp", { mode: "number" }).notNull(),
    valueSetOn: date("value_set_on").notNull(),
    valueSource: text("value_source").notNull(), // valuation id or 'seed'
    occupancy: text("occupancy").notNull(), // let | vacant | owner | land
    vacantSince: date("vacant_since"),
    lat: numeric("lat", { precision: 9, scale: 5 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 5 }).notNull(),
  },
  (t) => [index("assets_district_idx").on(t.districtId)],
);

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  sector: text("sector").notNull(),
});

export const leases = pgTable("leases", {
  id: text("id").primaryKey(), // L-014
  assetId: text("asset_id").notNull().references(() => assets.id),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  monthlyRent: bigint("monthly_rent", { mode: "number" }).notNull(),
  currency: text("currency").notNull(), // EGP | USD
  annualIndexationPct: numeric("annual_indexation_pct", { precision: 5, scale: 2 }).notNull(),
  depositMonths: integer("deposit_months").notNull(),
  clauses: jsonb("clauses").notNull(), // {break, renewal, sublet, governingLaw}
});

/** Income and cost lines per asset per month: hidden from the investor role by RLS. */
export const cashflows = pgTable(
  "cashflows",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull().references(() => assets.id),
    month: date("month").notNull(),
    kind: text("kind").notNull(), // rent | service_charge | maintenance | tax | insurance | other_cost
    amountEgp: bigint("amount_egp", { mode: "number" }).notNull(),
  },
  (t) => [index("cashflows_asset_idx").on(t.assetId, t.month)],
);

export const documents = pgTable("documents", {
  id: text("id").primaryKey(), // D-0101
  assetId: text("asset_id").notNull().references(() => assets.id),
  kind: text("kind").notNull(), // lease | title_deed | insurance | valuation_report | survey
  title: text("title").notNull(),
  status: text("status").notNull(), // verified | pending | missing | expired
  issuedOn: date("issued_on"),
  expiresOn: date("expires_on"),
  sampleFile: text("sample_file"), // bundled sample pdf, if any
  extracted: jsonb("extracted"), // confirmed fields from document intelligence
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const assumptionSets = pgTable("assumption_sets", {
  id: text("id").primaryKey(), // AS-1.0.0
  kind: text("kind").notNull(), // valuation | scenario | macro
  version: text("version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  author: text("author").notNull(),
  note: text("note").notNull(),
  payload: jsonb("payload").notNull(),
  contentHash: text("content_hash").notNull(),
});

export const valuations = pgTable("valuations", {
  id: text("id").primaryKey(), // V-0001
  assetId: text("asset_id").references(() => assets.id), // null for ad hoc
  assumptionSetId: text("assumption_set_id").notNull().references(() => assumptionSets.id),
  inputs: jsonb("inputs").notNull(),
  result: jsonb("result").notNull(),
  modelEstimateEgp: bigint("model_estimate_egp", { mode: "number" }).notNull(),
  finalValueEgp: bigint("final_value_egp", { mode: "number" }),
  adjustmentReasonCode: text("adjustment_reason_code"),
  adjustmentReason: text("adjustment_reason"),
  status: text("status").notNull(), // draft | in_review | confirmed | rejected
  requiredApprovals: integer("required_approvals").notNull().default(1), // 2 when the adjustment exceeds the threshold
  approvals: jsonb("approvals").notNull().default([]), // [{ userId, at }] by managers other than the proposer
  proposedBy: text("proposed_by").notNull().references(() => users.id),
  confirmedBy: text("confirmed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const valueHistory = pgTable(
  "value_history",
  {
    assetId: text("asset_id").notNull().references(() => assets.id),
    month: date("month").notNull(),
    valueEgp: bigint("value_egp", { mode: "number" }).notNull(),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.month] })],
);

export const comparableSales = pgTable(
  "comparable_sales",
  {
    id: text("id").primaryKey(), // S-0001
    districtId: text("district_id").notNull().references(() => districts.id),
    type: text("type").notNull(),
    areaSqm: integer("area_sqm").notNull(),
    floor: integer("floor"),
    finish: text("finish").notNull(),
    yearBuilt: integer("year_built"),
    soldOn: date("sold_on").notNull(),
    priceEgp: bigint("price_egp", { mode: "number" }).notNull(),
    compound: text("compound").notNull(),
  },
  (t) => [index("sales_district_type_idx").on(t.districtId, t.type)],
);

export const marketSeries = pgTable(
  "market_series",
  {
    districtId: text("district_id").notNull().references(() => districts.id),
    month: date("month").notNull(),
    priceIndex: numeric("price_index", { precision: 8, scale: 2 }).notNull(), // base 100 at first month
  },
  (t) => [primaryKey({ columns: [t.districtId, t.month] })],
);

export const marketSources = pgTable("market_sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  titleAr: text("title_ar").notNull(),
  provenance: text("provenance").notNull(), // synthetic | not_published
  publishedOn: date("published_on"),
  productionSource: text("production_source").notNull(),
  productionSourceAr: text("production_source_ar").notNull(),
  note: text("note").notNull(),
  noteAr: text("note_ar").notNull(),
});

export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  assumptionSetId: text("assumption_set_id").notNull().references(() => assumptionSets.id),
  inputs: jsonb("inputs").notNull(),
  contentHash: text("content_hash").notNull(), // hash of the assumption set payload used
  baseHash: text("base_hash").notNull().default(""), // hash of the portfolio data the result was computed on
  resultHash: text("result_hash").notNull().default(""), // hash of the central-case result
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // lease_renewal | missing_document | valuation_drift | vacancy_cost
  assetId: text("asset_id").references(() => assets.id),
  severity: text("severity").notNull(),
  routeRole: text("route_role").notNull(),
  status: text("status").notNull(), // open | snoozed | resolved
  snoozeReason: text("snooze_reason"),
  detail: jsonb("detail").notNull(),
  raisedAt: timestamp("raised_at", { withTimezone: true }).notNull(),
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // valuation | document | update_draft | role_change
  refId: text("ref_id").notNull(),
  proposedBy: text("proposed_by").notNull().references(() => users.id),
  routeRole: text("route_role").notNull(),
  status: text("status").notNull(), // pending | approved | rejected
  decidedBy: text("decided_by").references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const investorUpdates = pgTable("investor_updates", {
  id: text("id").primaryKey(), // U-001
  postedOn: date("posted_on").notNull(),
  title: text("title").notNull(),
  titleAr: text("title_ar").notNull(),
  body: text("body").notNull(),
  bodyAr: text("body_ar").notNull(),
  status: text("status").notNull(), // published | draft
  authorId: text("author_id").notNull().references(() => users.id),
  assetId: text("asset_id").references(() => assets.id),
});

/** Append-only. Each event stores the previous event's hash. */
export const auditEvents = pgTable("audit_events", {
  seq: integer("seq").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  detail: jsonb("detail").notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
});


/** Every investor pack ever generated: lets a printed pack be verified later against the audit chain. */
export const packExports = pgTable("pack_exports", {
  id: text("id").primaryKey(), // P-0001
  contentHash: text("content_hash").notNull(),
  verificationHash: text("verification_hash").notNull(),
  headSeq: integer("head_seq").notNull(),
  headHash: text("head_hash").notNull(),
  generatedBy: text("generated_by").notNull(),
  role: text("role").notNull(),
  lang: text("lang").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});
