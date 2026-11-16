import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "23.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { eInvoices, signingKeys } from "../src/db/schema";
import { canonical, canonicalHash } from "../src/lib/eta-canonical";
import { approveEInvoice, eInvoiceState, eInvoiceStatuses, signedDocument, signEInvoice, verifyEInvoice, voidEInvoice } from "../src/lib/einvoice-sign";
import { listInvoicesForEInvoice } from "../src/lib/einvoice";
import { listNotifications } from "../src/lib/notify";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const m1 = U("u-manager-1", "manager"), m2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst");

describe("canonical form", () => {
  it("upper-case quoted names, quoted values, arrays repeat their name before each item", () => {
    expect(canonical({ issuer: { id: "1", type: "B" }, total: 10, lines: [{ q: 1 }, { q: 2 }] })).toBe('"ISSUER""ID""1""TYPE""B""TOTAL""10""LINES""LINES""Q""1""LINES""Q""2"');
    expect(canonical({ a: [] })).toBe('"A"');
    expect(canonicalHash({ x: "1" })).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalHash({ x: "1" })).not.toBe(canonicalHash({ x: "2" }));
  });
});

describe("approve, sign, verify", () => {
  const pick = async () => (await listInvoicesForEInvoice(m1))![0].i.id;

  it("only managers; the approver cannot sign; a second manager signs; the signature verifies", async () => {
    const id = await pick();
    expect(await approveEInvoice(inv, id)).toEqual({ ok: false, error: "forbidden" });
    expect(await approveEInvoice(an, id)).toEqual({ ok: false, error: "forbidden" });
    const a = await approveEInvoice(m1, id);
    expect(a).toMatchObject({ ok: true });
    if (!a.ok) return;
    expect(await approveEInvoice(m2, id)).toEqual({ ok: false, error: "exists" });
    expect((await listNotifications(m2, "en")).find((x) => x.kind === "einvoice_to_sign")!.title).toBe(`E-invoice ${a.id} for ${id} is approved and waiting to be signed`);
    expect(await signEInvoice(m1, a.id)).toEqual({ ok: false, error: "own" });
    const s = await signEInvoice(m2, a.id);
    expect(s).toMatchObject({ ok: true });
    expect(await signEInvoice(m2, a.id)).toEqual({ ok: false, error: "closed" });
    expect(await verifyEInvoice(m1, a.id)).toMatchObject({ ok: true, valid: true, hashMatches: true, test: true });
    expect((await eInvoiceStatuses(m1))!.get(id)).toBe("signed");
    const doc = (await signedDocument(m1, id))!;
    expect((doc.document as { signatures: { signatureType: string; value: string }[] }).signatures[0]).toMatchObject({ signatureType: "I" });
    const [k] = await (await getDb()).select().from(signingKeys);
    expect(k).toMatchObject({ test: 1, label: "Test signing key (not an ITIDA certificate)" });
  });

  it("tampering after signing is detected", async () => {
    const id = await pick();
    const st = (await eInvoiceState(m1, id))!.current!;
    const doc = JSON.parse(st.document) as { totalAmount: number };
    await (await getDb()).update(eInvoices).set({ document: JSON.stringify({ ...doc, totalAmount: doc.totalAmount + 1 }) }).where(eq(eInvoices.id, st.id));
    expect(await verifyEInvoice(m1, st.id)).toMatchObject({ ok: true, valid: false, hashMatches: false });
    await (await getDb()).update(eInvoices).set({ document: st.document }).where(eq(eInvoices.id, st.id));
    expect(await verifyEInvoice(m1, st.id)).toMatchObject({ valid: true });
  });

  it("void needs a reason, keeps the row, and lets the invoice be prepared again", async () => {
    const id = await pick();
    const st = (await eInvoiceState(m1, id))!.current!;
    expect(await voidEInvoice(m1, st.id, { reason: "no" })).toEqual({ ok: false, error: "invalid" });
    expect(await voidEInvoice(m1, st.id, { reason: "Wrong period on the invoice." })).toEqual({ ok: true });
    expect(await voidEInvoice(m1, st.id, { reason: "Again and again." })).toEqual({ ok: false, error: "closed" });
    const after = (await eInvoiceState(m1, id))!;
    expect(after.current).toBeNull();
    expect(after.voided.map((v) => v.id)).toContain(st.id);
    expect(await approveEInvoice(m2, id)).toMatchObject({ ok: true });
  });

  it("row-level security: investors read nothing; nothing is deleted", async () => {
    expect((await withSession({ userId: inv.id, role: "investor" }, (tx) => tx.select().from(eInvoices))).length).toBe(0);
    await expect(withSession({ userId: m1.id, role: "manager" }, (tx) => tx.delete(eInvoices))).rejects.toThrow();
    await expect(withSession({ userId: m1.id, role: "manager" }, (tx) => tx.insert(signingKeys).values({ id: "SK-X", label: "x", publicKeyPem: "x", fingerprint: "x", createdAt: new Date() }))).rejects.toThrow();
  });
});
