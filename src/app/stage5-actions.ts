"use server";
import { getCurrentUser } from "@/lib/session";
import { reopenAlert, snoozeAlert } from "@/lib/alerts-service";
import { decideApproval } from "@/lib/approvals-service";
import { restoreDemo, tamperDemo, verifyChain } from "@/lib/audit-service";
import { resetDatabase } from "@/db/client";
import { appendAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";

async function who() { const u = await getCurrentUser(); if (!u) throw new Error("Not signed in"); return u; }
export async function snoozeAlertAction(key: string, reason: string) { return snoozeAlert(await who(), String(key), String(reason)); }
export async function reopenAlertAction(key: string) { return reopenAlert(await who(), String(key)); }
export async function decideApprovalAction(id: string, decision: "approve" | "reject") { return decideApproval(await who(), String(id), decision); }
export async function verifyChainAction() {
  const u = await who();
  if (!can(u.role, "audit.verify")) return { ok: false as const, error: "forbidden" as const };
  return { ok: true as const, check: await verifyChain() };
}
export async function tamperAction() { return tamperDemo(await who()); }
export async function restoreAction() { return restoreDemo(await who()); }
export async function resetDemoAction(confirm: string) {
  const u = await who();
  if (!can(u.role, "demo.reset")) return { ok: false as const, error: "forbidden" as const };
  if (confirm !== "RESET") return { ok: false as const, error: "confirm" as const };
  await resetDatabase();
  await appendAudit({ actorId: u.id, actorRole: u.role, action: "demo.reset", entity: "database", entityId: "demo", detail: { demo: true } });
  return { ok: true as const };
}
