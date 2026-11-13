import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { asc, desc, eq, lte, and } from "drizzle-orm";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { reportRuns, reportSchedules, users } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { queueEmail } from "./outbox";
import { uploadDir } from "./horus/files";
import { DEMO_TODAY } from "./assumptions";
import { buildDataset, DATASETS, toXlsx, type DatasetId, type Lang } from "./exports";
import { generateStatement } from "./statements";
import type { CurrentUser } from "./session";

/**
 * Scheduled and on-demand reports. A schedule has an audience, which decides whose permissions build the file:
 * an investor workbook or statement is always built as the investor role (so it can never carry rent, costs or
 * contacts), a management workbook as the manager who scheduled it. Files are kept on local disk with their
 * SHA-256; delivery goes through the simulated outbox. /api/cron/reports runs whatever is due.
 */
export const REPORT_KINDS = ["workbook_management", "workbook_investor", "statement"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
const reportsDir = () => path.join(uploadDir(), "reports");

export const nextRun = (from: string, frequency: string, day: number) => {
  const d = new Date(`${from}T00:00:00Z`);
  const step = frequency === "quarterly" ? 3 : 1;
  let cand = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
  while (cand.toISOString().slice(0, 10) <= from) cand = new Date(Date.UTC(cand.getUTCFullYear(), cand.getUTCMonth() + step, day));
  return cand.toISOString().slice(0, 10);
};

async function userById(id: string): Promise<CurrentUser | null> {
  const [u] = await (await getDb()).select().from(users).where(eq(users.id, id));
  return u ? { id: u.id, role: u.role as CurrentUser["role"], name: u.name, nameAr: u.nameAr, title: u.title, titleAr: u.titleAr } : null;
}

/** Build the file for a report. The audience decides the permissions it is built with. */
async function produce(kind: ReportKind, datasets: string[], lang: Lang, owner: CurrentUser) {
  if (kind === "statement") {
    const investor = await userById("u-investor");
    const r = await generateStatement(investor!, "2026", lang);
    if (!r.ok) throw new Error("statement failed");
    return { buffer: Buffer.from(r.buffer), fileName: `zmnhoof-statement-2026-${lang}.pdf`, mime: "application/pdf" };
  }
  const as = kind === "workbook_investor" ? (await userById("u-investor"))! : owner;
  const ids = datasets.filter((d) => d in DATASETS && DATASETS[d].roles.includes(as.role)) as DatasetId[];
  const sheets = await Promise.all(ids.map(async (id) => ({ name: id, table: await buildDataset(as, id, lang) })));
  const buffer = await toXlsx(sheets, lang);
  return { buffer, fileName: `zmnhoof-${kind === "workbook_investor" ? "investor" : "management"}-${DEMO_TODAY}-${lang}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

async function store(file: { buffer: Buffer; fileName: string; mime: string }, scheduleId: string | null, kind: string, by: string) {
  const id = `RR-${randomBytes(4).toString("hex")}`;
  await mkdir(reportsDir(), { recursive: true });
  await writeFile(path.join(reportsDir(), id), file.buffer);
  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  await (await getDb()).insert(reportRuns).values({ id, scheduleId, kind, fileName: file.fileName, mime: file.mime, bytes: file.buffer.length, sha256, generatedBy: by, at: new Date() });
  return { id, sha256 };
}

/** Run one schedule: build, keep and deliver to its recipients. A scheduled run moves the next date on; a one-off does not. */
async function runSchedule(scheduleId: string, by: CurrentUser | "scheduler") {
  const db = await getDb();
  const [s] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, scheduleId));
  if (!s) return null;
  const owner = (await userById(s.createdBy))!;
  const file = await produce(s.kind as ReportKind, s.datasets as string[], s.lang as Lang, owner);
  const run = await store(file, s.id, s.kind, by === "scheduler" ? "scheduler" : by.id);
  for (const to of s.recipients as string[]) {
    await queueEmail({ kind: "report", to, refId: run.id, subject: s.lang === "ar" ? `تقرير: ${s.name}` : `Report: ${s.name}`, body: s.lang === "ar" ? `مرفق: ${file.fileName} (البصمة ${run.sha256.slice(0, 12)}).\n\nبيانات تجريبية.` : `Attached: ${file.fileName} (fingerprint ${run.sha256.slice(0, 12)}).\n\nSample data.` }, owner);
  }
  const next = by === "scheduler" ? nextRun(s.nextRunOn > DEMO_TODAY ? s.nextRunOn : DEMO_TODAY, s.frequency, s.dayOfMonth) : s.nextRunOn;
  await db.update(reportSchedules).set({ lastRunAt: new Date(), nextRunOn: next }).where(eq(reportSchedules.id, s.id));
  await appendAudit({ actorId: by === "scheduler" ? "system" : by.id, actorRole: by === "scheduler" ? "system" : by.role, action: "report.run", entity: "report_schedule", entityId: s.id, detail: { run: run.id, sha256: run.sha256, recipients: (s.recipients as string[]).length, kind: s.kind, nextRunOn: next } });
  return { runId: run.id, nextRunOn: next, recipients: (s.recipients as string[]).length };
}

export async function listReports(user: CurrentUser) {
  if (!can(user.role, "reports.schedule")) return null;
  return withSession(sess(user), async (tx) => ({
    schedules: await tx.select().from(reportSchedules).orderBy(asc(reportSchedules.id)),
    runs: await tx.select().from(reportRuns).orderBy(desc(reportRuns.at)).limit(20),
  }));
}

export type ReportError = "forbidden" | "invalid" | "not_found";
const Schedule = z.object({
  name: z.string().trim().min(3).max(80),
  kind: z.enum(REPORT_KINDS),
  datasets: z.array(z.string()).max(10).default([]),
  frequency: z.enum(["monthly", "quarterly"]),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
  recipients: z.string().trim().min(3).max(500),
  lang: z.enum(["en", "ar"]),
});

export async function createSchedule(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; nextRunOn: string } | { ok: false; error: ReportError }> {
  if (!can(user.role, "reports.schedule")) return { ok: false, error: "forbidden" };
  const p = Schedule.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  const recipients = [...new Set(v.recipients.split(/[\s,;]+/).filter(Boolean))];
  if (!recipients.length || recipients.length > 10 || !recipients.every((r) => z.string().email().safeParse(r).success)) return { ok: false, error: "invalid" };
  const datasets = v.kind === "statement" ? [] : v.datasets.filter((d) => d in DATASETS);
  if (v.kind !== "statement" && !datasets.length) return { ok: false, error: "invalid" };
  const nextRunOn = nextRun(DEMO_TODAY, v.frequency, v.dayOfMonth);
  const id = await withSession(sess(user), async (tx) => {
    const n = (await tx.select({ id: reportSchedules.id }).from(reportSchedules)).length + 1;
    const sid = `RS-${String(n).padStart(3, "0")}`;
    await tx.insert(reportSchedules).values({ id: sid, name: v.name, kind: v.kind, datasets, frequency: v.frequency, dayOfMonth: v.dayOfMonth, recipients, lang: v.lang, active: 1, nextRunOn, createdBy: user.id, createdAt: new Date() });
    return sid;
  });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "report.schedule", entity: "report_schedule", entityId: id, detail: { kind: v.kind, frequency: v.frequency, dayOfMonth: v.dayOfMonth, recipients: recipients.length, datasets } });
  return { ok: true, id, nextRunOn };
}

export async function setScheduleActive(user: CurrentUser, id: string, active: boolean): Promise<{ ok: true } | { ok: false; error: ReportError }> {
  if (!can(user.role, "reports.schedule")) return { ok: false, error: "forbidden" };
  const r = await withSession(sess(user), (tx) => tx.update(reportSchedules).set({ active: active ? 1 : 0 }).where(eq(reportSchedules.id, String(id))).returning({ id: reportSchedules.id }));
  if (!r.length) return { ok: false, error: "not_found" };
  await appendAudit({ actorId: user.id, actorRole: user.role, action: active ? "report.resume" : "report.pause", entity: "report_schedule", entityId: id, detail: {} });
  return { ok: true };
}

export async function runScheduleNow(user: CurrentUser, id: string) {
  if (!can(user.role, "reports.schedule")) return { ok: false as const, error: "forbidden" as const };
  const visible = (await listReports(user))!.schedules.some((s) => s.id === id);
  if (!visible) return { ok: false as const, error: "not_found" as const };
  const r = await runSchedule(String(id), user);
  return r ? { ok: true as const, ...r } : { ok: false as const, error: "not_found" as const };
}

/** Run every active schedule that is due on or before the data date. Called by the cron route. */
export async function runDueReports(today = DEMO_TODAY) {
  const db = await getDb();
  const due = await db.select().from(reportSchedules).where(and(eq(reportSchedules.active, 1), lte(reportSchedules.nextRunOn, today)));
  const out: { id: string; runId: string }[] = [];
  for (const s of due) {
    const r = await runSchedule(s.id, "scheduler");
    if (r) out.push({ id: s.id, runId: r.runId });
  }
  return out;
}

/** A stored report file, for managers. */
export async function readRun(user: CurrentUser, id: string) {
  if (!can(user.role, "reports.schedule")) return null;
  const [r] = await withSession(sess(user), (tx) => tx.select().from(reportRuns).where(eq(reportRuns.id, String(id))));
  if (!r || !/^RR-[0-9a-f]{8}$/.test(r.id)) return null;
  try { return { run: r, bytes: await readFile(path.join(reportsDir(), r.id)) }; } catch { return null; }
}
