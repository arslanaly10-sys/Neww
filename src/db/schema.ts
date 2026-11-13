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

/** Horus conversations. Each user sees only their own threads (row-level security). */
export const horusThreads = pgTable("horus_threads", {
  id: text("id").primaryKey(), // T-<random>
  userId: text("user_id").notNull().references(() => users.id),
  mode: text("mode").notNull(), // portfolio | help
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [index("horus_threads_user").on(t.userId, t.updatedAt)]);

/** One question and its answer per row, in order. The answer is the validated answer object shown to the user. */
export const horusMessages = pgTable("horus_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().references(() => horusThreads.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  question: text("question").notNull(),
  answer: jsonb("answer").notNull(),
  fileIds: jsonb("file_ids").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [index("horus_messages_thread").on(t.threadId, t.createdAt)]);

/** Files uploaded for Horus to read. The bytes live on local disk; the extracted text is kept here. */
export const horusFiles = pgTable("horus_files", {
  id: text("id").primaryKey(), // F-<random>
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  pages: integer("pages").notNull(),
  sha256: text("sha256").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Demo requests from the public chatbot on the sign-in page. */
export const leads = pgTable("leads", {
  id: text("id").primaryKey(), // L-<random>
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company").notNull().default(""),
  message: text("message").notNull().default(""),
  locale: text("locale").notNull(),
  status: text("status").notNull(), // new | contacted
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Simulated email: everything the app would send is written here instead. Nothing leaves the server. */
export const outbox = pgTable("outbox", {
  id: text("id").primaryKey(), // M-<random>
  kind: text("kind").notNull(), // lead_ack | lead_notify | horus_email | ...
  to: text("to_addr").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  refId: text("ref_id"),
  createdBy: text("created_by").notNull(), // a user id, or "public"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Contact details per tenant (sample addresses on example domains). Managers only. */
export const tenantContacts = pgTable("tenant_contacts", {
  tenantId: text("tenant_id").primaryKey().references(() => tenants.id),
  contactName: text("contact_name").notNull(),
  contactNameAr: text("contact_name_ar").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
});

/** One rent invoice per lease per month. Amounts are in the lease currency; amountEgp converts at the sample rate. */
export const rentInvoices = pgTable("rent_invoices", {
  id: text("id").primaryKey(), // RI-L014-2026-11
  leaseId: text("lease_id").notNull().references(() => leases.id),
  assetId: text("asset_id").notNull().references(() => assets.id),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  period: date("period").notNull(), // first day of the month billed
  dueOn: date("due_on").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  amountEgp: bigint("amount_egp", { mode: "number" }).notNull(),
  paidEgp: bigint("paid_egp", { mode: "number" }).notNull().default(0),
  status: text("status").notNull(), // open | partial | paid
  lastReminderOn: date("last_reminder_on"),
}, (t) => [index("rent_invoices_lease").on(t.leaseId, t.period), index("rent_invoices_status").on(t.status)]);

/** Payments received against invoices. Append-only in the app. */
export const rentPayments = pgTable("rent_payments", {
  id: text("id").primaryKey(), // RP-<random> or RP-seed-…
  invoiceId: text("invoice_id").notNull().references(() => rentInvoices.id),
  amountEgp: bigint("amount_egp", { mode: "number" }).notNull(),
  paidOn: date("paid_on").notNull(),
  method: text("method").notNull(), // transfer | cheque | cash
  recordedBy: text("recorded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Where each lease's renewal stands. One row per lease that is being worked on. */
export const leaseRenewals = pgTable("lease_renewals", {
  leaseId: text("lease_id").primaryKey().references(() => leases.id),
  status: text("status").notNull(), // not_started | offered | negotiating | agreed | leaving
  proposedRent: bigint("proposed_rent", { mode: "number" }), // in the lease currency
  proposedEnd: date("proposed_end"),
  note: text("note").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/** Income and costs entered by hand (anything the lease and seed lines do not cover). Managers only. */
export const ledgerEntries = pgTable("ledger_entries", {
  id: text("id").primaryKey(), // LE-<random>
  assetId: text("asset_id").references(() => assets.id), // null = portfolio-level
  entryDate: date("entry_date").notNull(),
  category: text("category").notNull(), // rent | other_income | service_charge | maintenance | tax | insurance | management_fee | other_cost
  amountEgp: bigint("amount_egp", { mode: "number" }).notNull(), // income positive, costs negative
  memo: text("memo").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [index("ledger_entries_date").on(t.entryDate)]);

/** The portfolio budget: one amount per category per month (income positive, costs negative). Managers only. */
export const budgetLines = pgTable("budget_lines", {
  id: text("id").primaryKey(), // B-2026-01-rent
  month: date("month").notNull(),
  category: text("category").notNull(),
  amountEgp: bigint("amount_egp", { mode: "number" }).notNull(),
}, (t) => [index("budget_lines_month").on(t.month)]);

/** Distributions to investors. Proposed by a manager, approved by a different one, then marked paid. */
export const distributions = pgTable("distributions", {
  id: text("id").primaryKey(), // DS-001
  period: text("period").notNull(), // 2026-Q3
  amountEgp: bigint("amount_egp", { mode: "number" }).notNull(),
  basisNoiEgp: bigint("basis_noi_egp", { mode: "number" }).notNull(), // the quarter's net operating income it was sized on
  status: text("status").notNull(), // proposed | approved | rejected | paid
  note: text("note").notNull().default(""),
  proposedBy: text("proposed_by").notNull().references(() => users.id),
  decidedBy: text("decided_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  paidOn: date("paid_on"),
});

/** Maintenance requests and team tasks. One row per piece of work, with its current state. */
export const workOrders = pgTable("work_orders", {
  id: text("id").primaryKey(), // WO-001
  kind: text("kind").notNull(), // maintenance | task
  assetId: text("asset_id").references(() => assets.id), // null for a portfolio-level task
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(), // plumbing | electrical | hvac | lift | structural | cleaning | admin | other
  priority: text("priority").notNull(), // urgent | high | normal | low
  status: text("status").notNull(), // open | in_progress | on_hold | done | cancelled
  assigneeId: text("assignee_id").references(() => users.id),
  vendor: text("vendor").notNull().default(""),
  dueOn: date("due_on"),
  estimateEgp: bigint("estimate_egp", { mode: "number" }),
  actualEgp: bigint("actual_egp", { mode: "number" }),
  ledgerEntryId: text("ledger_entry_id"), // the cost line written when it was completed
  reportedBy: text("reported_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  completedOn: date("completed_on"),
}, (t) => [index("work_orders_status").on(t.status), index("work_orders_asset").on(t.assetId)]);

/** The timeline of a work order: creation, status changes, assignment, notes and costs. Append-only. */
export const workOrderEvents = pgTable("work_order_events", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id),
  kind: text("kind").notNull(), // created | status | assigned | due | estimate | note | completed
  text: text("text").notNull().default(""),
  detail: jsonb("detail").notNull().default({}),
  actorId: text("actor_id").notNull().references(() => users.id),
  at: timestamp("at", { withTimezone: true }).notNull(),
}, (t) => [index("work_order_events_wo").on(t.workOrderId, t.at)]);

/** Investor statements generated (PDF), so a statement can be traced back to the data it was made from. */
export const statements = pgTable("statements", {
  id: text("id").primaryKey(), // ST-0001
  period: text("period").notNull(), // 2026 | 2026-Q3
  lang: text("lang").notNull(),
  generatedBy: text("generated_by").notNull().references(() => users.id),
  contentHash: text("content_hash").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

/** Reports sent on a schedule (simulated delivery through the outbox). */
export const reportSchedules = pgTable("report_schedules", {
  id: text("id").primaryKey(), // RS-001
  name: text("name").notNull(),
  kind: text("kind").notNull(), // workbook | statement
  datasets: jsonb("datasets").notNull().default([]), // for a workbook: which sheets
  frequency: text("frequency").notNull(), // monthly | quarterly
  dayOfMonth: integer("day_of_month").notNull(),
  recipients: jsonb("recipients").notNull(), // email addresses
  lang: text("lang").notNull(),
  active: integer("active").notNull().default(1),
  nextRunOn: date("next_run_on").notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Every report produced, scheduled or on demand. The file is kept on local disk; its hash is kept here. */
export const reportRuns = pgTable("report_runs", {
  id: text("id").primaryKey(), // RR-<random>
  scheduleId: text("schedule_id"),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  sha256: text("sha256").notNull(),
  generatedBy: text("generated_by").notNull(), // a user id, or "scheduler"
  at: timestamp("at", { withTimezone: true }).notNull(),
});

/** A notification for one person. The text is built from the kind and its parameters in the reader's language. */
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(), // N-<random>
  userId: text("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  category: text("category").notNull(), // approvals | work | finance | leasing | reports | sales
  params: jsonb("params").notNull().default({}),
  link: text("link"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (t) => [index("notifications_user").on(t.userId, t.createdAt)]);

/** Per person and category: whether to notify in the app and by email. Missing rows mean the defaults. */
export const notificationPrefs = pgTable("notification_prefs", {
  userId: text("user_id").notNull().references(() => users.id),
  category: text("category").notNull(),
  inApp: integer("in_app").notNull(),
  email: integer("email").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.category] })]);

/**
 * Calendar events people put in the diary: meetings, inspections, viewings, deadlines. Lease ends, rent due dates,
 * work due dates, paid distributions and scheduled reports appear on the calendar too, but are read from their own
 * tables, never copied here. Investors see an event only when it is shared with them or they are invited.
 */
export const calendarEvents = pgTable("calendar_events", {
  id: text("id").primaryKey(), // CE-001
  title: text("title").notNull(),
  titleAr: text("title_ar"), // optional Arabic title; the English one is shown when it is empty
  kind: text("kind").notNull(), // meeting | inspection | viewing | deadline | other
  assetId: text("asset_id").references(() => assets.id),
  date: date("date").notNull(),
  startTime: text("start_time"), // HH:MM, null for an all-day event
  endTime: text("end_time"),
  location: text("location").notNull().default(""),
  notes: text("notes").notNull().default(""),
  shared: integer("shared").notNull().default(0), // 1: visible to investors
  attendees: jsonb("attendees").notNull().default([]), // user ids
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [index("calendar_events_date").on(t.date)]);
