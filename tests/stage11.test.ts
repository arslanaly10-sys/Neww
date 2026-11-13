import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "11.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { outbox, reportRuns, reportSchedules, statements } from "../src/db/schema";
import { buildDataset, canExport, datasetIdsFor, toCsv, toXlsx } from "../src/lib/exports";
import { buildStatement, generateStatement } from "../src/lib/statements";
import { createSchedule, nextRun, readRun, runDueReports, runScheduleNow } from "../src/lib/reports";
import { GET as cron } from "../src/app/api/cron/reports/route";
import type { CurrentUser } from "../src/lib/session";

process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "zos-rep-"));
const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");

describe("export formats", () => {
  const table = { columns: [{ key: "a", en: "Name", ar: "الاسم" }, { key: "b", en: "Value", ar: "القيمة", money: true }], rows: [{ a: 'Say "hi", ok', b: 1200 }, { a: "=HYPERLINK(\"x\")", b: null }, { a: "سطر\nثانٍ", b: 5 }] };
  it("writes RFC 4180 CSV with a byte-order mark, quoting and formula protection", () => {
    const csv = toCsv(table, "en");
    expect(csv.startsWith("﻿Name,Value\r\n")).toBe(true);
    expect(csv).toContain('"Say ""hi"", ok",1200');
    expect(csv).toContain(`"'=HYPERLINK(""x"")",`);
    expect(csv).toContain('"سطر\nثانٍ",5');
    expect(toCsv(table, "ar").startsWith("﻿الاسم,القيمة")).toBe(true);
  });
  it("writes a real Excel workbook: header row, values, right-to-left in Arabic", async () => {
    const buf = await toXlsx([{ name: "test", table }], "ar");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet("test")!;
    expect(ws.getRow(1).values).toEqual([undefined, "الاسم", "القيمة"]);
    expect(ws.getCell("B2").value).toBe(1200);
    expect(ws.views[0].rightToLeft).toBe(true);
  });
});

describe("who may export what", () => {
  it("offers each role only its own datasets", () => {
    expect(datasetIdsFor("investor")).toEqual(["holdings", "leases", "work", "distributions"]);
    expect(datasetIdsFor("manager")).toEqual(["holdings", "leases", "rent", "ledger", "budget", "work", "distributions"]);
    expect(datasetIdsFor("admin")).toEqual(["audit"]);
    expect(canExport("investor", "rent")).toBe(false);
    expect(canExport("investor", "nope")).toBe(false);
  });
  it("leaves rent, costs and arrears out of the investor's files", async () => {
    const l = await buildDataset(inv, "leases", "en");
    expect(l.columns.map((c) => c.key)).not.toContain("rent");
    expect(l.rows.length).toBeGreaterThan(10);
    const w = await buildDataset(inv, "work", "en");
    expect(w.columns.map((c) => c.key)).not.toContain("estimate");
    const m = await buildDataset(mgr, "leases", "ar");
    expect(m.columns.map((c) => c.key)).toEqual(expect.arrayContaining(["rent", "arrears"]));
    expect(m.columns[0].ar).toBe("العقد");
    const a = await buildDataset(adm, "audit", "en");
    expect(a.rows[0]).toHaveProperty("hash");
  });
});

describe("investor statements", () => {
  it("builds the year and a quarter from aggregate figures only", async () => {
    const y = (await buildStatement(inv, "2026", "en"))!;
    expect(y.portfolio.count).toBe(30);
    expect(y.distributions.map((d) => d.period)).toEqual(["2026-Q2", "2026-Q1"]);
    expect(y.noi.net).toBeGreaterThan(0);
    const q = (await buildStatement(inv, "2026-Q2", "en"))!;
    expect(q.distributions.map((d) => d.period)).toEqual(["2026-Q1"]); // paid in April, inside Q2
    expect(q.from).toBe("2026-04-01");
    expect(await buildStatement(adm, "2026", "en")).toBeNull();
  });
  it("renders a PDF in English and Arabic and records it", async () => {
    const e = await generateStatement(inv, "2026-Q3", "en");
    const a = await generateStatement(mgr, "2026", "ar");
    if (!e.ok || !a.ok) throw new Error("statement failed");
    expect(Buffer.from(e.buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(a.buffer).length).toBeGreaterThan(5000);
    const db = await getDb();
    expect((await db.select().from(statements).where(eq(statements.id, e.id)))[0]).toMatchObject({ period: "2026-Q3", lang: "en", generatedBy: "u-investor", contentHash: e.contentHash });
  });
});

describe("scheduled reports", () => {
  it("works out the next run date", () => {
    expect(nextRun("2026-11-12", "monthly", 1)).toBe("2026-12-01");
    expect(nextRun("2026-11-12", "monthly", 20)).toBe("2026-11-20");
    expect(nextRun("2026-11-12", "quarterly", 10)).toBe("2027-02-10");
    expect(nextRun("2026-11-12", "monthly", 12)).toBe("2026-12-12");
  });
  it("validates new schedules and keeps them to managers", async () => {
    expect(await createSchedule(inv, { name: "Mine", kind: "statement", frequency: "monthly", dayOfMonth: 1, recipients: "a@b.co", lang: "en" })).toEqual({ ok: false, error: "forbidden" });
    expect(await createSchedule(mgr, { name: "Bad mail", kind: "statement", frequency: "monthly", dayOfMonth: 1, recipients: "not-an-email", lang: "en" })).toEqual({ ok: false, error: "invalid" });
    expect(await createSchedule(mgr, { name: "No sheets", kind: "workbook_management", datasets: [], frequency: "monthly", dayOfMonth: 1, recipients: "a@b.co", lang: "en" })).toEqual({ ok: false, error: "invalid" });
    const ok = await createSchedule(mgr, { name: "Weekly-ish", kind: "workbook_investor", datasets: ["holdings", "rent", "ledger"], frequency: "monthly", dayOfMonth: 20, recipients: "karim@sample.test, x@example.com", lang: "en" });
    expect(ok).toEqual({ ok: true, id: "RS-004", nextRunOn: "2026-11-20" });
  });
  it("builds an investor workbook with investor permissions, even if management sheets were chosen", async () => {
    const r = await runScheduleNow(mgr, "RS-004");
    if (!r.ok) throw new Error(r.error);
    const file = (await readRun(mgr, r.runId))!;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.bytes as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["holdings"]);
    const db = await getDb();
    expect((await db.select().from(outbox).where(eq(outbox.refId, r.runId))).map((m) => m.to).sort()).toEqual(["karim@sample.test", "x@example.com"]);
    expect((await db.select().from(reportSchedules).where(eq(reportSchedules.id, "RS-004")))[0].nextRunOn).toBe("2026-11-20");
    expect(await readRun(inv, r.runId)).toBeNull();
  });
  it("runs what is due, through the cron route with its secret", async () => {
    expect((await cron(new Request("http://x/api/cron/reports"))).status).toBe(503);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await cron(new Request("http://x/api/cron/reports", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const res = await cron(new Request("http://x/api/cron/reports", { headers: { authorization: "Bearer s3cret-value" } }));
    const body = await res.json();
    expect(body.ran.map((x: { id: string }) => x.id)).toEqual(["RS-003"]);
    const db = await getDb();
    const [s] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, "RS-003"));
    expect(s.nextRunOn).toBe("2026-12-10");
    const [run] = await db.select().from(reportRuns).where(eq(reportRuns.id, body.ran[0].runId));
    expect(run).toMatchObject({ generatedBy: "scheduler", kind: "workbook_management" });
    expect(await runDueReports()).toEqual([]); // nothing left due
    delete process.env.CRON_SECRET;
  });
});
