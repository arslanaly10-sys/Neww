import { timingSafeEqual } from "node:crypto";
import { API_SOURCES, runImporter } from "@/lib/market-data/importers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Refreshes every API source (World Bank, WorldPop, NASA POWER, OpenStreetMap). Call it from a scheduler with
 * Authorization: Bearer <CRON_SECRET>. Without CRON_SECRET set, the endpoint is off. Failures are logged per source.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results: Record<string, unknown> = {};
  for (const s of API_SOURCES) results[s] = await runImporter(s, "schedule");
  return Response.json({ results });
}
