import { timingSafeEqual } from "node:crypto";
import { permitReminders } from "@/lib/permits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily: reminds managers of permits that lapse within 90 days or have lapsed. Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ reminded: await permitReminders() });
}
