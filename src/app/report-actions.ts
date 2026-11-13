"use server";
import { getCurrentUser } from "@/lib/session";
import { createSchedule, runScheduleNow, setScheduleActive } from "@/lib/reports";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function createScheduleAction(payload: unknown) { return createSchedule(await who(), payload); }
export async function runScheduleNowAction(id: string) { return runScheduleNow(await who(), String(id)); }
export async function setScheduleActiveAction(id: string, active: boolean) { return setScheduleActive(await who(), String(id), Boolean(active)); }
export async function runDueReportsAction() {
  const u = await who();
  const { can } = await import("@/lib/permissions");
  if (!can(u.role, "reports.schedule")) return { ok: false as const, error: "forbidden" as const };
  const { runDueReports } = await import("@/lib/reports");
  return { ok: true as const, ran: await runDueReports() };
}
