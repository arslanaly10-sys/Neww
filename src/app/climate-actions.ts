"use server";
import { getCurrentUser } from "@/lib/session";
import { recordAssessment } from "@/lib/climate";

export async function recordAssessmentAction(p: unknown) {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  const r = await recordAssessment(u, p);
  return r.ok ? { ok: true as const, id: r.id, residual: r.result.residual } : r;
}
