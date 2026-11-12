import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { getDb } from "../src/db/client";
import { assets, auditEvents, documents, leases } from "../src/db/schema";
import { confirmExtraction, extractSample, getDocumentFlags, identifyUpload } from "../src/lib/docs/service";
import { sha256Bytes } from "../src/lib/docs/samples";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const investor = U("u-investor", "investor"), mgr = U("u-manager-1", "manager"), admin = U("u-admin", "admin");
const hashOf = (f: string) => sha256Bytes(new Uint8Array(readFileSync(`public/samples/${f}`)));

describe("document identification", () => {
  it("recognises the three samples by hash and refuses everything else", async () => {
    expect(await identifyUpload(mgr, hashOf("sample-lease-en.pdf"))).toEqual({ ok: true, sampleId: "lease-en" });
    expect(await identifyUpload(mgr, hashOf("sample-deed-ar.pdf"))).toEqual({ ok: true, sampleId: "deed-ar" });
    expect(await identifyUpload(mgr, hashOf("sample-lease-bilingual.pdf"))).toEqual({ ok: true, sampleId: "lease-bilingual" });
    expect(await identifyUpload(mgr, "0".repeat(64))).toEqual({ ok: false, error: "not_sample" });
    expect(await identifyUpload(mgr, "not-a-hash")).toEqual({ ok: false, error: "not_sample" });
  });
  it("keeps extraction away from investors and the administrator, because it contains rent", async () => {
    expect(await extractSample(investor, "lease-en")).toEqual({ ok: false, error: "forbidden" });
    expect(await extractSample(admin, "lease-en")).toEqual({ ok: false, error: "forbidden" });
    expect(await identifyUpload(investor, hashOf("sample-lease-en.pdf"))).toEqual({ ok: false, error: "forbidden" });
    expect(await confirmExtraction(investor, { sampleId: "lease-en", values: {}, checked: [] })).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("extraction compared with the record", () => {
  it("shows what differs from the current record before anything is written", async () => {
    const r = await extractSample(mgr, "lease-en");
    if (!r.ok) throw new Error("extract");
    const f = Object.fromEntries(r.view.fields.map((x) => [x.key, x]));
    expect(f.monthlyRent).toMatchObject({ value: 116000, recordValue: 114000, differs: true });
    expect(f["clause.renewal"]).toMatchObject({ value: "mutual", recordValue: "tenantFirstRight", differs: true });
    expect(f.startDate).toMatchObject({ differs: false });
    expect(f.areaSqm).toMatchObject({ value: 185, recordValue: 185, differs: false });
    expect(r.view.asset.id).toBe("A-001");
    const db = await getDb();
    const [l] = await db.select().from(leases).where(eq(leases.id, "L-011"));
    expect(l.monthlyRent).toBe(114000); // nothing written yet
  });
});

describe("confirmation", () => {
  it("updates the lease and asset record, verifies the document and audits the exact changes", async () => {
    const res = await confirmExtraction(mgr, { sampleId: "lease-en", values: {}, checked: [] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.changes.map((c) => c.key).sort()).toEqual(["clause.renewal", "monthlyRent"]);
    expect(res.changes.find((c) => c.key === "monthlyRent")).toEqual({ key: "monthlyRent", from: 114000, to: 116000 });
    const db = await getDb();
    const [l] = await db.select().from(leases).where(eq(leases.id, "L-011"));
    expect(l.monthlyRent).toBe(116000);
    expect((l.clauses as Record<string, string>).renewal).toBe("mutual");
    expect((l.clauses as Record<string, string>).break).toBe("after12m90d");
    const [d] = await db.select().from(documents).where(eq(documents.id, "D-101"));
    expect(d.status).toBe("verified");
    expect(d.confirmedBy).toBe("u-manager-1");
    expect((d.extracted as { engine: string }).engine).toBe("sample-rules-1.0");
    const ev = (await db.select().from(auditEvents)).filter((e) => e.action === "document.confirm");
    expect((ev[ev.length - 1].detail as { changes: unknown[] }).changes).toHaveLength(2);
    // confirming again changes nothing
    const again = await confirmExtraction(mgr, { sampleId: "lease-en", values: {}, checked: [] });
    expect(again).toMatchObject({ ok: true, changes: [] });
  });
  it("makes a person tick every conflicting or edited field before it is written", async () => {
    const need = await confirmExtraction(mgr, { sampleId: "lease-bilingual", values: {}, checked: [] });
    expect(need).toEqual({ ok: false, error: "unchecked", keys: ["indexationPct"] });
    const edited = await confirmExtraction(mgr, { sampleId: "lease-bilingual", values: { monthlyRent: 150000, indexationPct: 8 }, checked: ["indexationPct"] });
    expect(edited).toEqual({ ok: false, error: "unchecked", keys: ["monthlyRent"] }); // an edit also needs a tick
    const db = await getDb();
    expect((await db.select().from(leases).where(eq(leases.id, "L-018")))[0].depositMonths).toBe(2); // still untouched
    const ok = await confirmExtraction(mgr, { sampleId: "lease-bilingual", values: { indexationPct: 8 }, checked: ["indexationPct"] });
    if (!ok.ok) throw new Error(JSON.stringify(ok));
    expect(ok.changes.map((c) => c.key)).toContain("depositMonths");
    const [l] = await db.select().from(leases).where(eq(leases.id, "L-018"));
    expect(l.depositMonths).toBe(3);
    expect(Number(l.annualIndexationPct)).toBe(8);
  });
  it("applies a deed: asset area and registration date, and marks the deed verified", async () => {
    const res = await confirmExtraction(mgr, { sampleId: "deed-ar", values: {}, checked: [] });
    if (!res.ok) throw new Error(JSON.stringify(res));
    expect(res.changes).toEqual([{ key: "areaSqm", from: 620, to: 612 }]);
    const db = await getDb();
    expect((await db.select().from(assets).where(eq(assets.id, "A-002")))[0].areaSqm).toBe(612);
  });
  it("rejects invalid edited values", async () => {
    expect(await confirmExtraction(mgr, { sampleId: "lease-en", values: { endDate: "31/08/2027" }, checked: ["endDate"] })).toEqual({ ok: false, error: "invalid", keys: ["endDate"] });
    expect(await confirmExtraction(mgr, { sampleId: "lease-en", values: { monthlyRent: -5 }, checked: ["monthlyRent"] })).toEqual({ ok: false, error: "invalid", keys: ["monthlyRent"] });
    expect(await confirmExtraction(mgr, { sampleId: "nope", values: {}, checked: [] })).toEqual({ ok: false, error: "not_sample" });
    expect(await confirmExtraction(mgr, { nonsense: true })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("missing and expiring documents", () => {
  it("flags every gap from the data, for managers and investors alike", async () => {
    for (const u of [mgr, investor]) {
      const f = await getDocumentFlags(u);
      expect(f.counts.missing).toBe(3);
      expect(f.counts.expired).toBe(2);
      expect(f.counts.pending).toBe(2);
      expect(f.counts.lease_ending).toBeGreaterThanOrEqual(6);
      expect(f.flags.filter((x) => x.kind === "lease_ending").every((x) => (x.days ?? 999) <= 120)).toBe(true);
      expect(f.flags[0].kind).toBe("missing");
    }
    expect((await getDocumentFlags(admin)).total).toBe(0); // no financial content for the administrator
  });
});
