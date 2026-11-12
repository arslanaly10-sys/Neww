import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractFromBytes, needsCheck, parseLines, similarity } from "../src/lib/docs/extract";
import { SAMPLES, sha256Bytes } from "../src/lib/docs/samples";

const bytes = (f: string) => new Uint8Array(readFileSync(`public/samples/${f}`));
const byKey = (r: Awaited<ReturnType<typeof extractFromBytes>>) => Object.fromEntries(r.fields.map((f) => [f.key, f]));

describe("fuzzy matching", () => {
  it("tolerates the letters PDF extraction garbles in Arabic", () => {
    expect(similarity("اإليجار الشهري", "الإيجار الشهري")).toBeGreaterThanOrEqual(0.75);
    expect(similarity("مبلغ التأمني", "مبلغ التأمين")).toBeGreaterThanOrEqual(0.75);
    expect(similarity("المساحة", "المؤجر")).toBeLessThan(0.4);
    expect(similarity("Lease start date", "Lease end date")).toBeLessThan(1);
  });
});

describe("sample extraction", () => {
  it("reads the English lease completely, with source lines", async () => {
    const r = byKey(await extractFromBytes(bytes("sample-lease-en.pdf"), "lease"));
    expect(r.reference.value).toBe("L-011");
    expect(r.tenant.value).toBe("Sample Tenant A (family)");
    expect(r.landlord.value).toBe("Sample Family Office");
    expect(r.areaSqm.value).toBe(185);
    expect(r.startDate.value).toBe("2025-09-01");
    expect(r.endDate.value).toBe("2027-08-31");
    expect(r.monthlyRent).toMatchObject({ value: 116000, currency: "EGP" });
    expect(r.indexationPct.value).toBe(10);
    expect(r.depositMonths.value).toBe(2);
    expect(r["clause.break"].value).toBe("after12m90d");
    expect(r["clause.renewal"].value).toBe("mutual");
    expect(r["clause.sublet"].value).toBe("consentRequired");
    expect(r["clause.governingLaw"].value).toBe("egypt");
    expect(r.monthlyRent.snippet).toContain("Monthly rent: EGP 116,000");
    expect(r.monthlyRent.page).toBe(1);
    for (const f of Object.values(r)) expect(f.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("reads the Arabic title deed despite garbled letters", async () => {
    const res = await extractFromBytes(bytes("sample-deed-ar.pdf"), "deed");
    const r = byKey(res);
    expect(res.language).toBe("ar");
    expect(r.registryNo.value).toBe("SR-2022-04417");
    expect(r.owner.value).toBe("Sample Family Office");
    expect(r.unit.value).toBe("Tagamoa Business Hub, Floor 6");
    expect(r.areaSqm.value).toBe(612);
    expect(r.registeredOn.value).toBe("2022-06-20");
    expect(res.fields).toHaveLength(5);
  });
  it("reads both halves of the bilingual lease and flags what disagrees", async () => {
    const res = await extractFromBytes(bytes("sample-lease-bilingual.pdf"), "lease");
    const r = byKey(res);
    expect(res.language).toBe("bilingual");
    expect(res.pageCount).toBe(2);
    expect(r.reference.value).toBe("L-018");
    expect(r.monthlyRent).toMatchObject({ value: 143000, currency: "EGP" });
    expect(r.monthlyRent.langs).toEqual(["en", "ar"]);
    expect(r.startDate.value).toBe("2025-06-01");
    expect(r.endDate.value).toBe("2027-05-31");
    expect(r.depositMonths.value).toBe(3);
    expect(r["clause.renewal"].value).toBe("tenantFirstRight");
    // English says 8%, Arabic says 9%: a conflict, so it must be checked by a person.
    expect(r.indexationPct.conflict).toEqual({ en: 8, ar: 9 });
    expect(needsCheck(r.indexationPct)).toBe(true);
    expect(r.indexationPct.value).toBe(8);
    // Agreement between the two languages raises confidence.
    expect(r.areaSqm.confidence).toBeGreaterThan(0.95);
    expect(needsCheck(r.areaSqm)).toBe(false);
  });
  it("matches bundled files to the manifest by hash", () => {
    const manifest = JSON.parse(readFileSync("public/samples/manifest.json", "utf8")) as { file: string; sha256: string }[];
    for (const s of SAMPLES) expect(manifest.find((m) => m.file === s.file)?.sha256).toBe(sha256Bytes(bytes(s.file)));
  });
  it("returns nothing for text that is not a known document", () => {
    expect(parseLines(["Hello world\nThis is not a lease"], "lease")).toEqual([]);
  });
});
