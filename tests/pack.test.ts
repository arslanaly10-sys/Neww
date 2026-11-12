import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { getDb } from "../src/db/client";
import { auditEvents } from "../src/db/schema";
import { generatePack, verifyPack } from "../src/lib/pack/service";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const investor = U("u-investor", "investor"), mgr = U("u-manager-1", "manager"), admin = U("u-admin", "admin");
const read = async (buf: Buffer | Uint8Array) => { const pdf = await getDocumentProxy(new Uint8Array(buf)); const { text, totalPages } = await extractText(pdf, { mergePages: true }); return { text: text as string, pages: totalPages }; };

describe("investor pack", () => {
  it("generates a seven-page English PDF with every required section and the hashes", async () => {
    const r = await generatePack(mgr, "en", "EGP");
    if (!r.ok) throw new Error("gen");
    writeFileSync("docs/stage-4/investor-pack-en.pdf", r.buffer);
    expect(r.buffer.subarray(0, 4).toString()).toBe("%PDF");
    const { text, pages } = await read(r.buffer);
    expect(pages).toBe(7);
    for (const s of ["Investor pack", "Summary", "Performance", "Allocation", "Risks", "Valuation changes", "Audit appendix", "Sample data, not an offer", r.verification, r.content, "Vision, Wisdom, Verify", "AI informs, you decide"]) expect(text).toContain(s);
    expect(r.id).toMatch(/^P-\d{4}$/);
  });
  it("generates a seven-page Arabic PDF", async () => {
    const r = await generatePack(investor, "ar", "EGP");
    if (!r.ok) throw new Error("gen");
    writeFileSync("docs/stage-4/investor-pack-ar.pdf", r.buffer);
    const { text, pages } = await read(r.buffer);
    expect(pages).toBe(7);
    expect(text).toMatch(/[؀-ۿ]{4}/);
    expect(text).toContain(r.verification); // hashes stay Latin, so they can be copied and checked
  });
  it("never includes per-asset income or rent, for any role", async () => {
    for (const u of [mgr, investor]) {
      const r = await generatePack(u, "en", "EGP");
      if (!r.ok) throw new Error("gen");
      const { text } = await read(r.buffer);
      expect(text).not.toMatch(/monthly rent|114,000|116,000|143,000|service charge/i);
    }
  });
  it("keeps the pack out of the administrator's hands", async () => {
    expect(await generatePack(admin, "en", "EGP")).toEqual({ ok: false, error: "forbidden" });
  });
  it("converts to USD when asked", async () => {
    const r = await generatePack(mgr, "en", "USD");
    if (!r.ok) throw new Error("gen");
    expect((await read(r.buffer)).text).toMatch(/USD \d/);
  });
  it("registers each pack, binds it to the audit chain and verifies it later", async () => {
    const r = await generatePack(mgr, "en", "EGP");
    if (!r.ok) throw new Error("gen");
    const v = await verifyPack(r.verification);
    expect(v).toMatchObject({ found: true, id: r.id, lang: "en", role: "manager", chainIntact: true, matched: "verification" });
    expect(await verifyPack(r.content)).toMatchObject({ found: true, matched: "content" });
    expect(await verifyPack("0".repeat(64))).toEqual({ found: false });
    expect(await verifyPack("nonsense")).toEqual({ found: false });
    const db = await getDb();
    const ev = (await db.select().from(auditEvents)).filter((e) => e.action === "pack.generate" && e.entityId === r.id);
    expect(ev).toHaveLength(1);
    expect((ev[0].detail as { verificationHash: string }).verificationHash).toBe(r.verification);
  });
  it("different content gives a different content hash; a later chain head gives a different verification hash", async () => {
    const a = await generatePack(mgr, "en", "EGP"), b = await generatePack(mgr, "ar", "EGP");
    if (!a.ok || !b.ok) throw new Error("gen");
    expect(a.content).not.toBe(b.content);
    expect(a.verification).not.toBe(b.verification);
  });
  it("detects a tampered audit chain when verifying an old pack", async () => {
    const r = await generatePack(mgr, "en", "EGP");
    if (!r.ok) throw new Error("gen");
    const db = await getDb();
    const [head] = await db.select().from(auditEvents).where(eq(auditEvents.seq, r.model.audit.headSeq));
    await db.update(auditEvents).set({ hash: "f".repeat(64) }).where(eq(auditEvents.seq, head.seq));
    expect(await verifyPack(r.verification)).toMatchObject({ found: true, chainIntact: false });
  });
});
