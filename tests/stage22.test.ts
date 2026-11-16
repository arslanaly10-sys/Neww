import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "22.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { documents } from "../src/db/schema";
import { extractFromBytes, parseLines } from "../src/lib/docs/extract";
import { confirmExtraction, extractSample, identifyUpload } from "../src/lib/docs/service";
import { assetPermits } from "../src/lib/permits";
import { assetClimate } from "../src/lib/climate";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const m1 = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst");
const pdf = (f: string) => new Uint8Array(readFileSync(`public/samples/${f}`));

describe("reading permits and surveys", () => {
  it("reads every field of the bilingual certificate and catches the expiry that differs between languages", async () => {
    const r = await extractFromBytes(pdf("sample-permit-civil-defence.pdf"), "permit");
    expect(r.language).toBe("bilingual");
    const f = Object.fromEntries(r.fields.map((x) => [x.key, x]));
    expect(f.permitType).toMatchObject({ value: "civil_defence", langs: ["en", "ar"] });
    expect(f.certificateNo.value).toBe("CP-2026-11873");
    expect(f.issuedOn).toMatchObject({ value: "2026-11-08" });
    expect(f.issuedOn.confidence).toBeGreaterThanOrEqual(0.9);
    expect(f.expiresOn.conflict).toEqual({ en: "2027-11-07", ar: "2027-11-08" });
    expect(f.expiresOn.confidence).toBeLessThan(0.9);
  });

  it("reads the survey, joining the findings that wrap onto a second line", async () => {
    const r = await extractFromBytes(pdf("sample-survey-flood.pdf"), "survey");
    const f = Object.fromEntries(r.fields.map((x) => [x.key, x.value]));
    expect(f).toMatchObject({ hazard: "flood", rating: 3, method: "site_survey", surveyedOn: "2026-10-30", surveyor: "Delta Geo Engineering (fictional)" });
    expect(String(f.findings)).toMatch(/blocked and have been cleared; roof outlets are adequate\.$/);
  });

  it("reads ratings and choices in other phrasings, and refuses what it cannot place", () => {
    const f = (lines: string[]) => Object.fromEntries(parseLines([lines.join("\n")], "survey").map((x) => [x.key, x.value]));
    expect(f(["Risk rating: 4/5", "Hazard assessed: Earthquake"])).toMatchObject({ rating: 4, hazard: "seismic" });
    expect(f(["Hazard assessed: something else"]).hazard).toBeUndefined();
  });

  it("the earlier samples still read exactly as before", async () => {
    const r = await extractFromBytes(pdf("sample-lease-en.pdf"), "lease");
    expect(r.fields.length).toBe(14);
    expect(r.fields.every((x) => x.confidence >= 0.9)).toBe(true);
  });

  it("only the bundled files are accepted, by hash", async () => {
    const h = createHash("sha256").update(pdf("sample-survey-flood.pdf")).digest("hex");
    expect(await identifyUpload(m1, h)).toEqual({ ok: true, sampleId: "survey-flood" });
    expect(await identifyUpload(m1, "0".repeat(64))).toEqual({ ok: false, error: "not_sample" });
    expect(await identifyUpload(an, h)).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("confirming into records", () => {
  it("compares with the current permit, insists the conflict is checked, then records the permit for an analyst", async () => {
    const v = await extractSample(m1, "permit-civil-defence");
    if (!v.ok) throw new Error("extract");
    const exp = v.view.fields.find((x) => x.key === "expiresOn")!;
    expect(exp).toMatchObject({ needsCheck: true, recordValue: "2026-09-01", differs: true });
    expect(await confirmExtraction(m1, { sampleId: "permit-civil-defence", values: {}, checked: [] })).toMatchObject({ ok: false, error: "unchecked", keys: ["expiresOn"] });
    expect(await confirmExtraction(inv, { sampleId: "permit-civil-defence", values: {}, checked: ["expiresOn"] })).toMatchObject({ ok: false, error: "forbidden" });
    const r = await confirmExtraction(m1, { sampleId: "permit-civil-defence", values: { expiresOn: "2027-11-07" }, checked: ["expiresOn"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created?.kind).toBe("permit");
    const p = (await assetPermits(m1, "A-010"))!.items.find((i) => i.kind === "civil_defence")!;
    expect(p.permit).toMatchObject({ id: r.created!.id, status: "valid", reference: "CP-2026-11873", expiresOn: "2027-11-07", documentId: "D-901", verification: "unverified" });
    expect(p.state.state).toBe("ok");
    const [d] = await (await getDb()).select().from(documents).where(eq(documents.id, "D-901"));
    expect(d).toMatchObject({ status: "verified", issuedOn: "2026-11-08", expiresOn: "2027-11-07", confirmedBy: "u-manager-1" });
  });

  it("a confirmed survey becomes a site assessment that sets the climate level", async () => {
    const before = (await assetClimate(m1, "A-008"))!.results.find((x) => x.hazard === "flood")!;
    expect(before.override).toBeNull();
    const r = await confirmExtraction(m1, { sampleId: "survey-flood", values: {}, checked: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created?.kind).toBe("assessment");
    const after = (await assetClimate(inv, "A-008"))!.results.find((x) => x.hazard === "flood")!;
    expect(after).toMatchObject({ level: 3, screening: before.screening });
    expect(after.override).toMatchObject({ method: "site_survey", assessedOn: "2026-10-30" });
    expect(after.override!.note).toMatch(/^Delta Geo Engineering \(fictional\): Ground-floor shops/);
  });

  it("an edited rating out of range is refused", async () => {
    expect(await confirmExtraction(m1, { sampleId: "survey-flood", values: { rating: 7 }, checked: ["rating"] })).toMatchObject({ ok: false, error: "invalid", keys: ["rating"] });
  });
});
