import "server-only";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { eInvoices, signingKeys, users } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { buildEInvoice } from "./einvoice";
import { canonical, canonicalHash } from "./eta-canonical";
import { notify } from "./notify";
import type { CurrentUser } from "./session";

/**
 * Approving and signing e-invoice drafts. One manager approves the draft (which freezes the document), a different
 * manager signs its canonical text. The demo signs with a TEST key (RSA, SHA-256): it proves the workflow and lets
 * anyone re-check a signature, but the Tax Authority accepts only CAdES-BES signatures made with a certificate
 * issued under ITIDA, so nothing signed here can be submitted.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
export type SignError = "forbidden" | "invalid" | "not_found" | "errors" | "own" | "closed" | "exists";

interface Key { id: string; privateKey: KeyObject; publicPem: string; fingerprint: string }
const state: { key: Promise<Key> | null } = { key: null };

/** The test key: from ETA_TEST_SIGNING_KEY (a PKCS#8 PEM) when set, otherwise made once per server process. */
function loadKey(): Promise<Key> {
  state.key ??= (async () => {
    const pem = process.env.ETA_TEST_SIGNING_KEY;
    const privateKey = pem ? createPrivateKey(pem) : generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const publicPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
    const fingerprint = createHash("sha256").update(publicPem).digest("hex");
    const id = `SK-TEST-${fingerprint.slice(0, 8).toUpperCase()}`;
    const db = await getDb();
    const [have] = await db.select({ id: signingKeys.id }).from(signingKeys).where(eq(signingKeys.id, id));
    if (!have) await db.insert(signingKeys).values({ id, label: "Test signing key (not an ITIDA certificate)", publicKeyPem: publicPem, fingerprint, test: 1, createdAt: new Date() });
    return { id, privateKey, publicPem, fingerprint };
  })();
  return state.key;
}

/** Why a signed draft still cannot go to the Tax Authority. Honest and fixed until the real set-up exists. */
export const SUBMISSION_BLOCKERS = ["testKey", "issuerRegistration", "itemCode", "credentials"] as const;

export async function eInvoiceState(user: CurrentUser, invoiceId: string) {
  if (!can(user.role, "rent.manage")) return null;
  const rows = await withSession(sess(user), (tx) => tx.select().from(eInvoices).where(eq(eInvoices.invoiceId, String(invoiceId))).orderBy(desc(eInvoices.approvedAt)));
  const people = await withSession(sess(user), (tx) => tx.select({ id: users.id, name: users.name, nameAr: users.nameAr }).from(users));
  const who = (id: string | null) => (id ? people.find((p) => p.id === id) ?? { id, name: id, nameAr: id } : null);
  const current = rows.find((r) => r.status !== "voided") ?? null;
  return { current: current ? { ...current, approver: who(current.approvedBy), signer: who(current.signedBy) } : null, voided: rows.filter((r) => r.status === "voided").map((r) => ({ ...r, voider: who(r.voidedBy) })) };
}

/** Statuses for the list page. */
export async function eInvoiceStatuses(user: CurrentUser) {
  if (!can(user.role, "rent.manage")) return null;
  const rows = await withSession(sess(user), (tx) => tx.select({ invoiceId: eInvoices.invoiceId, status: eInvoices.status }).from(eInvoices).where(ne(eInvoices.status, "voided")));
  return new Map(rows.map((r) => [r.invoiceId, r.status]));
}

/** Approve a draft: its checks must have no errors. The document is frozen as approved. */
export async function approveEInvoice(user: CurrentUser, invoiceId: string): Promise<{ ok: true; id: string } | { ok: false; error: SignError }> {
  if (!can(user.role, "rent.manage")) return { ok: false, error: "forbidden" };
  const b = await buildEInvoice(user, String(invoiceId));
  if (!b) return { ok: false, error: "not_found" };
  if (b.checks.some((c) => c.level === "error" && !c.ok)) return { ok: false, error: "errors" };
  const r = await withSession(sess(user), async (tx) => {
    const [live] = await tx.select().from(eInvoices).where(and(eq(eInvoices.invoiceId, b.invoice.id), ne(eInvoices.status, "voided")));
    if (live) return { error: "exists" as const };
    const ids = await tx.select({ id: eInvoices.id }).from(eInvoices);
    const id = `EI-${String(Math.max(0, ...ids.map((x) => Number(x.id.slice(3)))) + 1).padStart(3, "0")}`;
    await tx.insert(eInvoices).values({ id, invoiceId: b.invoice.id, status: "approved", document: JSON.stringify(b.doc), canonicalHash: canonicalHash(b.doc), approvedBy: user.id, approvedAt: new Date() });
    return { id };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "einvoice.approve", entity: "e_invoice", entityId: r.id, detail: { invoiceId: b.invoice.id, hash: canonicalHash(b.doc) } });
  await notify({ to: { roles: ["manager"] }, kind: "einvoice_to_sign", params: { id: r.id, invoice: b.invoice.id }, link: `/leases/einvoices/${b.invoice.id}`, actorId: user.id });
  return { ok: true, id: r.id };
}

/** Sign an approved draft: a different manager, over the frozen document's canonical text. */
export async function signEInvoice(user: CurrentUser, id: string): Promise<{ ok: true; keyId: string } | { ok: false; error: SignError }> {
  if (!can(user.role, "rent.manage")) return { ok: false, error: "forbidden" };
  const key = await loadKey();
  const r = await withSession(sess(user), async (tx) => {
    const [x] = await tx.select().from(eInvoices).where(eq(eInvoices.id, String(id)));
    if (!x) return { error: "not_found" as const };
    if (x.status !== "approved") return { error: "closed" as const };
    if (x.approvedBy === user.id) return { error: "own" as const };
    const doc = JSON.parse(x.document);
    if (canonicalHash(doc) !== x.canonicalHash) return { error: "invalid" as const }; // changed since approval
    const signature = sign("sha256", Buffer.from(canonical(doc), "utf8"), key.privateKey).toString("base64");
    await tx.update(eInvoices).set({ status: "signed", signature, keyId: key.id, signedBy: user.id, signedAt: new Date() }).where(eq(eInvoices.id, x.id));
    return { x };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "einvoice.sign", entity: "e_invoice", entityId: r.x.id, detail: { invoiceId: r.x.invoiceId, keyId: key.id, test: true, hash: r.x.canonicalHash } });
  return { ok: true, keyId: key.id };
}

/** Re-check a signature against the stored public key and the document as stored now. */
export async function verifyEInvoice(user: CurrentUser, id: string): Promise<{ ok: true; valid: boolean; hashMatches: boolean; keyId: string; test: boolean } | { ok: false; error: SignError }> {
  if (!can(user.role, "rent.manage")) return { ok: false, error: "forbidden" };
  const r = await withSession(sess(user), async (tx) => {
    const [x] = await tx.select().from(eInvoices).where(eq(eInvoices.id, String(id)));
    if (!x || !x.signature || !x.keyId) return null;
    const [k] = await tx.select().from(signingKeys).where(eq(signingKeys.id, x.keyId));
    return k ? { x, k } : null;
  });
  if (!r) return { ok: false, error: "not_found" };
  const doc = JSON.parse(r.x.document);
  const valid = verify("sha256", Buffer.from(canonical(doc), "utf8"), createPublicKey(r.k.publicKeyPem), Buffer.from(r.x.signature!, "base64"));
  return { ok: true, valid, hashMatches: canonicalHash(doc) === r.x.canonicalHash, keyId: r.k.id, test: r.k.test === 1 };
}

const Void = z.object({ reason: z.string().trim().min(5).max(300) });

/** Void an approved or signed draft with a reason, so the invoice can be prepared again. The row stays. */
export async function voidEInvoice(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: SignError }> {
  if (!can(user.role, "rent.manage")) return { ok: false, error: "forbidden" };
  const p = Void.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const r = await withSession(sess(user), async (tx) => {
    const [x] = await tx.select().from(eInvoices).where(eq(eInvoices.id, String(id)));
    if (!x) return { error: "not_found" as const };
    if (x.status === "voided") return { error: "closed" as const };
    await tx.update(eInvoices).set({ status: "voided", voidedBy: user.id, voidReason: p.data.reason }).where(eq(eInvoices.id, x.id));
    return { x };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "einvoice.void", entity: "e_invoice", entityId: r.x.id, detail: { invoiceId: r.x.invoiceId, was: r.x.status, reason: p.data.reason } });
  return { ok: true };
}

/** The signed document as the Tax Authority's JSON expects it, with the signature attached (marked as a test). */
export async function signedDocument(user: CurrentUser, invoiceId: string) {
  const s = await eInvoiceState(user, invoiceId);
  const x = s?.current;
  if (!x || x.status !== "signed") return null;
  return { id: x.id, document: { ...(JSON.parse(x.document) as Record<string, unknown>), signatures: [{ signatureType: "I", value: x.signature }] }, keyId: x.keyId, hash: x.canonicalHash };
}
