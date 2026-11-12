import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, withSession } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { can } from "./permissions";
import { GENESIS_HASH, auditHash, canonical } from "./hash";
import { appendAudit } from "./audit";
import type { CurrentUser } from "./session";

export interface ChainCheck {
  ok: boolean; count: number; headSeq: number; headHash: string;
  firstBad: null | { index: number; seq: number; kind: "link" | "hash"; expected: string; found: string };
  checkedAt: string;
}

/** Recompute every event's hash from its stored content and the previous hash, and compare. Reports the first break. */
export async function verifyChain(): Promise<ChainCheck> {
  const db = await getDb();
  const rows = await db.select().from(auditEvents).orderBy(auditEvents.seq);
  let prev = GENESIS_HASH;
  let firstBad: ChainCheck["firstBad"] = null;
  rows.forEach((e, i) => {
    if (firstBad) return;
    if (e.prevHash !== prev) { firstBad = { index: i, seq: e.seq, kind: "link", expected: prev, found: e.prevHash }; return; }
    const h = auditHash({ seq: e.seq, at: e.at.toISOString(), actorId: e.actorId, actorRole: e.actorRole, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail }, prev);
    if (h !== e.hash) { firstBad = { index: i, seq: e.seq, kind: "hash", expected: h, found: e.hash }; return; }
    prev = e.hash;
  });
  const head = rows[rows.length - 1];
  return { ok: !firstBad, count: rows.length, headSeq: head?.seq ?? 0, headHash: head?.hash ?? GENESIS_HASH, firstBad, checkedAt: new Date().toISOString() };
}

export interface AuditRow { seq: number; at: string; actorId: string; actorName: string; actorNameAr: string; actorRole: string; action: string; entity: string; entityId: string; detail: unknown; prevHash: string; hash: string }
/** Administrator only (row-level security enforces it as well). */
export async function listAudit(user: CurrentUser, opts: { q?: string; action?: string; limit?: number; offset?: number } = {}): Promise<{ rows: AuditRow[]; total: number; actions: string[] }> {
  if (!can(user.role, "audit.view")) return { rows: [], total: 0, actions: [] };
  const all = await withSession({ userId: user.id, role: user.role }, async (tx) => ({ e: await tx.select().from(auditEvents).orderBy(desc(auditEvents.seq)), u: await tx.select().from(users) }));
  const name = (id: string) => all.u.find((x) => x.id === id);
  const q = (opts.q ?? "").trim().toLowerCase();
  const filtered = all.e.filter((e) => (!opts.action || e.action === opts.action || e.action.startsWith(`${opts.action}.`)) && (!q || `${e.action} ${e.entityId} ${e.actorId} ${canonical(e.detail)}`.toLowerCase().includes(q)));
  const page = filtered.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50));
  return {
    total: filtered.length, actions: [...new Set(all.e.map((e) => e.action))].sort(),
    rows: page.map((e) => ({ seq: e.seq, at: e.at.toISOString(), actorId: e.actorId, actorName: name(e.actorId)?.name ?? e.actorId, actorNameAr: name(e.actorId)?.nameAr ?? e.actorId, actorRole: e.actorRole, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail, prevHash: e.prevHash, hash: e.hash })),
  };
}

const TARGET_SEQ = 7; // an early valuation confirmation, so the break is easy to see in the log
export type TamperError = "forbidden" | "already_tampered" | "nothing_to_restore";

/**
 * Demo only. Edits one stored event behind the chain's back, exactly as an attacker with database access would, so
 * "Verify chain" has something to catch. The act is itself written to the log, with the original content, so it can be undone.
 */
export async function tamperDemo(user: CurrentUser): Promise<{ ok: true; seq: number } | { ok: false; error: TamperError }> {
  if (!can(user.role, "audit.verify")) return { ok: false, error: "forbidden" };
  const db = await getDb();
  if (!(await verifyChain()).ok) return { ok: false, error: "already_tampered" };
  const [target] = await db.select().from(auditEvents).where(eq(auditEvents.seq, TARGET_SEQ));
  if (!target) return { ok: false, error: "nothing_to_restore" };
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "audit.demo_tamper", entity: "audit_event", entityId: String(TARGET_SEQ), detail: { seq: TARGET_SEQ, original: target.detail, demo: true } });
  const tampered = { ...(target.detail as Record<string, unknown>), finalValueEgp: 1, tamperedForDemo: true };
  await db.update(auditEvents).set({ detail: tampered }).where(eq(auditEvents.seq, TARGET_SEQ));
  return { ok: true, seq: TARGET_SEQ };
}

export async function restoreDemo(user: CurrentUser): Promise<{ ok: true } | { ok: false; error: TamperError }> {
  if (!can(user.role, "audit.verify")) return { ok: false, error: "forbidden" };
  const db = await getDb();
  const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.seq));
  const last = rows.find((e) => e.action === "audit.demo_tamper");
  if (!last) return { ok: false, error: "nothing_to_restore" };
  const d = last.detail as { seq: number; original: unknown };
  await db.update(auditEvents).set({ detail: d.original as never }).where(eq(auditEvents.seq, d.seq));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "audit.demo_restore", entity: "audit_event", entityId: String(d.seq), detail: { seq: d.seq, demo: true } });
  return { ok: true };
}
