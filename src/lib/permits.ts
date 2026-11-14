import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withSession } from "@/db/client";
import { assets, documents, permits, users } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { DEMO_TODAY } from "./assumptions";
import { notify } from "./notify";
import { assetCompliance, EXPIRING_DAYS, PERMIT_KINDS, PERMIT_STATUSES, permitState, requiredFor, TITLE_FORMS, type PermitKind, type PermitState } from "./permits-rules";
import type { CurrentUser } from "./session";

/**
 * The permit register: what each asset holds, what it lacks, what is about to lapse, and who has checked it.
 * Managers record; analysts verify (never their own entry); investors read. Renewing supersedes the old row.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
export type PermitError = "forbidden" | "invalid" | "not_found" | "own" | "closed";
type Row = typeof permits.$inferSelect;

export interface PermitView extends Row { state: PermitState; days: number | null; reason: string; required: boolean; recorderName: string; recorderNameAr: string; reviewerName: string | null; reviewerNameAr: string | null; documentTitle: string | null }

async function load(user: CurrentUser, assetId?: string) {
  return withSession(sess(user), async (tx) => ({
    p: await tx.select().from(permits).where(assetId ? eq(permits.assetId, assetId) : undefined).orderBy(asc(permits.recordedAt)),
    a: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr, type: assets.type, status: assets.status }).from(assets).where(assetId ? eq(assets.id, assetId) : undefined).orderBy(asc(assets.id)),
    u: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr }).from(users),
    d: await tx.select({ id: documents.id, title: documents.title, assetId: documents.assetId }).from(documents).where(assetId ? eq(documents.assetId, assetId) : undefined),
  }));
}

function view(r: Row, required: boolean, u: Map<string, { name: string; nameAr: string }>, d: Map<string, string>): PermitView {
  const s = permitState(r, DEMO_TODAY);
  return { ...r, ...s, required, recorderName: u.get(r.recordedBy)?.name ?? r.recordedBy, recorderNameAr: u.get(r.recordedBy)?.nameAr ?? r.recordedBy, reviewerName: r.reviewedBy ? u.get(r.reviewedBy)?.name ?? r.reviewedBy : null, reviewerNameAr: r.reviewedBy ? u.get(r.reviewedBy)?.nameAr ?? r.reviewedBy : null, documentTitle: r.documentId ? d.get(r.documentId) ?? null : null };
}

function build(data: Awaited<ReturnType<typeof load>>) {
  const u = new Map(data.u.map((x) => [x.id, x]));
  const d = new Map(data.d.map((x) => [x.id, x.title]));
  return data.a.map((a) => {
    const required = requiredFor(a.type, a.status);
    const current = data.p.filter((p) => p.assetId === a.id && !p.supersededAt);
    const history = data.p.filter((p) => p.assetId === a.id && p.supersededAt).reverse();
    const kinds = PERMIT_KINDS.filter((k) => required.includes(k) || current.some((p) => p.kind === k));
    const items = kinds.map((k) => { const r = current.find((p) => p.kind === k); return { kind: k, required: required.includes(k), permit: r ? view(r, required.includes(k), u, d) : null, state: r ? permitState(r, DEMO_TODAY) : permitState(null, DEMO_TODAY) }; });
    const states = Object.fromEntries(items.map((i) => [i.kind, i.state.state])) as Record<string, PermitState>;
    return { asset: a, required, items, history: history.map((h) => view(h, required.includes(h.kind as PermitKind), u, d)), compliance: assetCompliance(required, states), documents: data.d.filter((x) => x.assetId === a.id) };
  });
}

/** Every asset with its permits and compliance state, plus totals: the portfolio register. */
export async function permitRegister(user: CurrentUser) {
  if (!can(user.role, "asset.view")) return null;
  const rows = build(await load(user));
  const all = rows.flatMap((r) => r.items);
  const current = rows.flatMap((r) => r.items.map((i) => i.permit).filter((p): p is PermitView => !!p));
  return {
    rows,
    totals: {
      assets: rows.length, inOrder: rows.filter((r) => r.compliance.state === "ok" || r.compliance.state === "attention").length,
      action: all.filter((i) => i.required && i.state.state === "action").length, expiring: all.filter((i) => i.state.state === "expiring").length,
      pending: all.filter((i) => i.state.state === "pending").length, unverified: current.filter((p) => p.verification !== "verified").length,
      unregistered: current.filter((p) => p.kind === "title_registration" && p.form && p.form !== "registered").length,
    },
    queue: current.filter((p) => p.verification !== "verified").sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()),
  };
}

export async function assetPermits(user: CurrentUser, assetId: string) {
  if (!can(user.role, "asset.view")) return null;
  return build(await load(user, String(assetId)))[0] ?? null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const opt = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal(""), s]).optional().default("");
const Record_ = z.object({
  assetId: z.string().regex(/^A-\d{3}$/), kind: z.enum(PERMIT_KINDS), status: z.enum(PERMIT_STATUSES), form: opt(z.enum(TITLE_FORMS)),
  authority: z.string().trim().max(160).optional().default(""), reference: z.string().trim().max(80).optional().default(""),
  appliedOn: opt(isoDate), issuedOn: opt(isoDate), expiresOn: opt(isoDate), documentId: opt(z.string().max(20)), note: z.string().trim().max(500).optional().default(""),
});

/**
 * Record a permit's current state (a new one, a renewal or a change). The previous entry for the same asset and
 * kind is kept as history. Dates must make sense: issued not in the future, expiry after issue, valid needs issue.
 */
export async function recordPermit(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; auditSeq: number } | { ok: false; error: PermitError }> {
  if (!can(user.role, "records.edit")) return { ok: false, error: "forbidden" };
  const p = Record_.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  if (v.issuedOn && v.issuedOn > DEMO_TODAY) return { ok: false, error: "invalid" };
  if (v.appliedOn && v.appliedOn > DEMO_TODAY) return { ok: false, error: "invalid" };
  if (v.issuedOn && v.expiresOn && v.expiresOn <= v.issuedOn) return { ok: false, error: "invalid" };
  if (v.status === "valid" && !v.issuedOn) return { ok: false, error: "invalid" };
  if (v.status === "pending" && !v.appliedOn) return { ok: false, error: "invalid" };
  if (v.kind === "title_registration" && v.status === "valid" && !v.form) return { ok: false, error: "invalid" };
  if (v.kind !== "title_registration" && v.form) return { ok: false, error: "invalid" };
  const r = await withSession(sess(user), async (tx) => {
    const [a] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, v.assetId));
    if (!a) return { error: "not_found" as const };
    if (v.documentId) { const [d] = await tx.select({ id: documents.id }).from(documents).where(and(eq(documents.id, v.documentId), eq(documents.assetId, v.assetId))); if (!d) return { error: "invalid" as const }; }
    const ids = await tx.select({ id: permits.id }).from(permits);
    const id = `PM-${String(Math.max(0, ...ids.map((x) => Number(x.id.slice(3)))) + 1).padStart(3, "0")}`;
    const [prev] = await tx.select().from(permits).where(and(eq(permits.assetId, v.assetId), eq(permits.kind, v.kind), isNull(permits.supersededAt)));
    const now = new Date();
    if (prev) await tx.update(permits).set({ supersededAt: now }).where(eq(permits.id, prev.id));
    await tx.insert(permits).values({ id, assetId: v.assetId, kind: v.kind, status: v.status, form: v.form || null, authority: v.authority, reference: v.reference, appliedOn: v.appliedOn || null, issuedOn: v.issuedOn || null, expiresOn: v.expiresOn || null, documentId: v.documentId || null, note: v.note, verification: "unverified", recordedBy: user.id, recordedAt: now });
    return { id, prev: prev?.id ?? null, prevStatus: prev?.status ?? null };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "permit.record", entity: "permit", entityId: r.id, detail: { assetId: v.assetId, kind: v.kind, status: v.status, form: v.form || undefined, expiresOn: v.expiresOn || undefined, supersedes: r.prev ?? undefined, was: r.prevStatus ?? undefined } });
  await notify({ to: { roles: ["analyst"] }, kind: "permit_to_verify", params: { id: r.id, asset: v.assetId }, link: "/asset/permits#queue", actorId: user.id });
  return { ok: true, id: r.id, auditSeq: ev.seq };
}

const Review = z.object({ verdict: z.enum(["verified", "disputed"]), note: z.string().trim().max(300).optional().default("") });

/** Check a permit against its document: verified, or disputed with a reason. Never your own entry. */
export async function reviewPermit(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; auditSeq: number } | { ok: false; error: PermitError }> {
  if (!can(user.role, "records.verify")) return { ok: false, error: "forbidden" };
  const p = Review.safeParse(raw);
  if (!p.success || (p.data.verdict === "disputed" && p.data.note.length < 5)) return { ok: false, error: "invalid" };
  const r = await withSession(sess(user), async (tx) => {
    const [x] = await tx.select().from(permits).where(eq(permits.id, String(id)));
    if (!x) return { error: "not_found" as const };
    if (x.supersededAt) return { error: "closed" as const };
    if (x.recordedBy === user.id) return { error: "own" as const };
    await tx.update(permits).set({ verification: p.data.verdict, reviewedBy: user.id, reviewedAt: new Date(), reviewNote: p.data.note || null }).where(eq(permits.id, x.id));
    return { x };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "permit.review", entity: "permit", entityId: r.x.id, detail: { assetId: r.x.assetId, kind: r.x.kind, verdict: p.data.verdict, note: p.data.note || undefined } });
  if (p.data.verdict === "disputed") await notify({ to: { users: [r.x.recordedBy] }, kind: "permit_disputed", params: { id: r.x.id, asset: r.x.assetId }, link: `/asset/${r.x.assetId}/record#permits`, actorId: user.id });
  return { ok: true, auditSeq: ev.seq };
}

/**
 * Remind managers of permits that lapse within the window (or have lapsed), once per permit per window: the
 * scheduler calls this daily. Returns the permits it reminded about.
 */
export async function permitReminders(today = DEMO_TODAY, actor: CurrentUser = { id: "system", role: "manager", name: "System", nameAr: "النظام", title: "", titleAr: "" }) {
  const rows = await withSession(sess(actor), (tx) => tx.select().from(permits).where(isNull(permits.supersededAt)));
  const due = rows.filter((p) => { const s = permitState(p, today); return (s.state === "expiring" || (s.state === "action" && s.reason === "expired" && p.expiresOn)) && (!p.remindedOn || p.remindedOn < addDays(today, -EXPIRING_DAYS)); });
  for (const p of due) {
    const s = permitState(p, today);
    await withSession(sess(actor), (tx) => tx.update(permits).set({ remindedOn: today }).where(eq(permits.id, p.id)));
    await notify({ to: { roles: ["manager"] }, kind: "permit_expiring", params: { id: p.id, asset: p.assetId, kind: p.kind, days: s.days ?? 0 }, link: `/asset/${p.assetId}/record#permits`, actorId: null });
  }
  return due.map((p) => p.id);
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
