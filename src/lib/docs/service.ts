import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withSession } from "@/db/client";
import { assets, documents, leases, tenants } from "@/db/schema";
import { can } from "../permissions";
import { appendAudit } from "../audit";
import { DEMO_TODAY } from "../assumptions";
import type { CurrentUser } from "../session";
import { ENGINE, extractFromBytes, needsCheck, type ExtractedField, type FieldKey } from "./extract";
import { identifySample, readSample, SAMPLES, type Sample } from "./samples";

export type DocError = "forbidden" | "not_sample" | "not_found" | "invalid" | "unchecked";
type Res<T> = ({ ok: true } & T) | { ok: false; error: DocError; keys?: string[] };
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

export interface FieldView extends ExtractedField { recordValue: string | number | null; differs: boolean; needsCheck: boolean }
export interface ExtractionView {
  sample: { id: string; file: string; kind: string; language: string }; asset: { id: string; name: string; nameAr: string };
  docId: string; engine: string; pageCount: number; language: string; fields: FieldView[];
  confirmed: { at: string; by: string } | null;
}

export async function identifyUpload(user: CurrentUser, hash: string): Promise<Res<{ sampleId: string }>> {
  if (!can(user.role, "document.confirm_extraction")) return { ok: false, error: "forbidden" };
  const s = await identifySample(String(hash));
  return s ? { ok: true, sampleId: s.id } : { ok: false, error: "not_sample" };
}

interface Records { asset: typeof assets.$inferSelect; lease: typeof leases.$inferSelect | null; tenantName: string | null; doc: typeof documents.$inferSelect }
async function loadRecords(user: CurrentUser, s: Sample): Promise<Records | null> {
  return withSession(sess(user), async (tx) => {
    const [asset] = await tx.select().from(assets).where(eq(assets.id, s.assetId));
    const [doc] = await tx.select().from(documents).where(eq(documents.id, s.docId));
    if (!asset || !doc) return null;
    let lease: Records["lease"] = null, tenantName: string | null = null;
    if (s.leaseId) {
      [lease] = await tx.select().from(leases).where(eq(leases.id, s.leaseId));
      if (lease) tenantName = (await tx.select().from(tenants).where(eq(tenants.id, lease.tenantId)))[0]?.name ?? null;
    }
    return { asset, lease: lease ?? null, tenantName, doc };
  });
}

function recordValue(key: FieldKey, r: Records): string | number | null {
  const l = r.lease;
  switch (key) {
    case "reference": return l?.id ?? null;
    case "tenant": return r.tenantName;
    case "areaSqm": return r.asset.areaSqm;
    case "startDate": return l?.startDate ?? null;
    case "endDate": return l?.endDate ?? null;
    case "monthlyRent": return l?.monthlyRent ?? null;
    case "indexationPct": return l ? Number(l.annualIndexationPct) : null;
    case "depositMonths": return l?.depositMonths ?? null;
    case "clause.break": case "clause.renewal": case "clause.sublet": case "clause.governingLaw":
      return l ? ((l.clauses as Record<string, string>)[key.slice(7)] ?? null) : null;
    case "registeredOn": return r.doc.issuedOn;
    default: return null; // landlord, premises, owner, unit, registry number: kept with the document, not compared
  }
}
const same = (a: string | number | null, b: string | number) => a !== null && String(a).toLowerCase() === String(b).toLowerCase();

async function run(user: CurrentUser, s: Sample) {
  const ex = await extractFromBytes(await readSample(s), s.kind);
  const rec = await loadRecords(user, s);
  return { ex, rec };
}

export async function extractSample(user: CurrentUser, sampleId: string): Promise<Res<{ view: ExtractionView }>> {
  if (!can(user.role, "document.confirm_extraction")) return { ok: false, error: "forbidden" };
  const s = SAMPLES.find((x) => x.id === sampleId);
  if (!s) return { ok: false, error: "not_sample" };
  const { ex, rec } = await run(user, s);
  if (!rec) return { ok: false, error: "not_found" };
  const fields: FieldView[] = ex.fields.map((f) => {
    const rv = recordValue(f.key, rec);
    return { ...f, recordValue: rv, differs: rv !== null && !same(rv, f.value), needsCheck: needsCheck(f) };
  });
  return {
    ok: true,
    view: {
      sample: { id: s.id, file: s.file, kind: s.kind, language: s.language }, asset: { id: rec.asset.id, name: rec.asset.name, nameAr: rec.asset.nameAr },
      docId: s.docId, engine: ENGINE, pageCount: ex.pageCount, language: ex.language, fields,
      confirmed: rec.doc.confirmedAt ? { at: rec.doc.confirmedAt.toISOString(), by: rec.doc.confirmedBy ?? "" } : null,
    },
  };
}

const valueSchema = z.union([z.string().trim().min(1).max(300), z.number().finite()]);
const confirmSchema = z.object({ sampleId: z.string(), values: z.record(z.string(), valueSchema), checked: z.array(z.string()).max(40) });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function coerce(f: ExtractedField, v: string | number): string | number | null {
  switch (f.type) {
    case "date": return typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
    case "money": case "number": case "percent": case "months": { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n >= 0 ? n : null; }
    case "clause": return typeof v === "string" && /^[A-Za-z0-9]+$/.test(v) && v !== "unrecognised" ? v : null;
    default: return String(v).trim() || null;
  }
}

/** Apply confirmed fields to the records. The extraction is redone on the server; the client only supplies edits and ticks. */
export async function confirmExtraction(user: CurrentUser, raw: unknown): Promise<Res<{ changes: { key: string; from: string | number | null; to: string | number }[] }>> {
  if (!can(user.role, "document.confirm_extraction")) return { ok: false, error: "forbidden" };
  const p = confirmSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const s = SAMPLES.find((x) => x.id === p.data.sampleId);
  if (!s) return { ok: false, error: "not_sample" };
  const { ex, rec } = await run(user, s);
  if (!rec) return { ok: false, error: "not_found" };

  const final: Record<string, string | number> = {};
  const unchecked: string[] = [];
  for (const f of ex.fields) {
    const submitted = p.data.values[f.key] ?? f.value;
    const v = coerce(f, submitted);
    if (v === null) return { ok: false, error: "invalid", keys: [f.key] };
    const edited = String(v) !== String(f.value);
    if ((needsCheck(f) || edited) && !p.data.checked.includes(f.key)) unchecked.push(f.key);
    final[f.key] = v;
  }
  if (unchecked.length) return { ok: false, error: "unchecked", keys: unchecked };

  const changes: { key: string; from: string | number | null; to: string | number }[] = [];
  const track = (key: string, from: string | number | null, to: string | number | undefined) => { if (to !== undefined && !same(from, to)) changes.push({ key, from, to }); };
  const now = new Date();
  await withSession(sess(user), async (tx) => {
    // Asset area is shared by leases and deeds.
    if (final.areaSqm !== undefined) {
      track("areaSqm", rec.asset.areaSqm, final.areaSqm);
      if (Number(final.areaSqm) !== rec.asset.areaSqm) await tx.update(assets).set({ areaSqm: Math.round(Number(final.areaSqm)) }).where(eq(assets.id, rec.asset.id));
    }
    if (s.kind === "lease" && rec.lease) {
      const clauses = { ...(rec.lease.clauses as Record<string, string>) };
      for (const k of ["break", "renewal", "sublet", "governingLaw"]) { const v = final[`clause.${k}`]; if (v !== undefined) { track(`clause.${k}`, clauses[k] ?? null, v); clauses[k] = String(v); } }
      for (const k of ["startDate", "endDate", "monthlyRent", "indexationPct", "depositMonths"] as const) track(k, recordValue(k, rec), final[k]);
      await tx.update(leases).set({
        startDate: String(final.startDate ?? rec.lease.startDate), endDate: String(final.endDate ?? rec.lease.endDate),
        monthlyRent: Math.round(Number(final.monthlyRent ?? rec.lease.monthlyRent)), annualIndexationPct: Number(final.indexationPct ?? rec.lease.annualIndexationPct).toFixed(2),
        depositMonths: Math.round(Number(final.depositMonths ?? rec.lease.depositMonths)), clauses,
      }).where(eq(leases.id, rec.lease.id));
    }
    if (s.kind === "deed") track("registeredOn", rec.doc.issuedOn, final.registeredOn);
    await tx.update(documents).set({
      status: "verified", issuedOn: s.kind === "deed" ? String(final.registeredOn ?? rec.doc.issuedOn) : rec.doc.issuedOn,
      extracted: { engine: ENGINE, sample: s.id, fields: ex.fields.map((f) => ({ key: f.key, extracted: f.value, confirmed: final[f.key], confidence: f.confidence, page: f.page, snippet: f.snippet })) },
      confirmedBy: user.id, confirmedAt: now,
    }).where(eq(documents.id, s.docId));
  });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "document.confirm", entity: "document", entityId: s.docId, detail: { sample: s.id, asset: rec.asset.id, engine: ENGINE, changes } });
  return { ok: true, changes };
}

export interface DocFlag { kind: "missing" | "expired" | "pending" | "lease_ending" | "doc_expiring"; assetId: string; assetName: string; assetNameAr: string; docId: string | null; label: string; date: string | null; days: number | null }
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);

/** Missing, expired and pending documents, plus leases and documents that run out within 120 days. Visible to every role that can see documents. */
export async function getDocumentFlags(user: CurrentUser, within = 120): Promise<{ flags: DocFlag[]; counts: Record<DocFlag["kind"], number>; total: number }> {
  const flags = await withSession(sess(user), async (tx) => {
    const a = await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets);
    const d = await tx.select().from(documents);
    const l = await tx.select({ id: leases.id, assetId: leases.assetId, endDate: leases.endDate }).from(leases);
    const name = (id: string) => a.find((x) => x.id === id)!;
    const out: DocFlag[] = [];
    for (const x of d) {
      const asset = name(x.assetId);
      if (x.status === "missing" || x.status === "expired" || x.status === "pending")
        out.push({ kind: x.status, assetId: x.assetId, assetName: asset.name, assetNameAr: asset.nameAr, docId: x.id, label: x.kind, date: x.expiresOn, days: x.expiresOn ? daysBetween(DEMO_TODAY, x.expiresOn) : null });
      else if (x.expiresOn && x.kind !== "lease") { const dd = daysBetween(DEMO_TODAY, x.expiresOn); if (dd >= 0 && dd <= within) out.push({ kind: "doc_expiring", assetId: x.assetId, assetName: asset.name, assetNameAr: asset.nameAr, docId: x.id, label: x.kind, date: x.expiresOn, days: dd }); }
    }
    for (const x of l) { const dd = daysBetween(DEMO_TODAY, x.endDate); if (dd <= within) { const asset = name(x.assetId); out.push({ kind: "lease_ending", assetId: x.assetId, assetName: asset.name, assetNameAr: asset.nameAr, docId: x.id, label: "lease", date: x.endDate, days: dd }); } }
    return out;
  });
  const order = { missing: 0, expired: 1, lease_ending: 2, doc_expiring: 3, pending: 4 } as const;
  flags.sort((x, y) => order[x.kind] - order[y.kind] || (x.days ?? 0) - (y.days ?? 0) || x.assetId.localeCompare(y.assetId));
  const counts = { missing: 0, expired: 0, pending: 0, lease_ending: 0, doc_expiring: 0 } as Record<DocFlag["kind"], number>;
  flags.forEach((f) => counts[f.kind]++);
  return { flags, counts, total: flags.length };
}
