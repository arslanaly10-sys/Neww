import { timingSafeEqual } from "node:crypto";
import { runDueReports } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs every scheduled report that is due. Call it from a scheduler (Vercel Cron, a system cron) with
 * Authorization: Bearer <CRON_SECRET>. Without CRON_SECRET set, the endpoint is off.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const ran = await runDueReports();
  return Response.json({ ran });
}
