import { getCurrentUser } from "@/lib/session";
import { readRun } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/reports/RR-…: a stored report file (managers). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const r = await readRun(user, (await params).id);
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(r.bytes), { headers: { "Content-Type": r.run.mime, "Content-Disposition": `attachment; filename="${r.run.fileName}"`, "Cache-Control": "no-store", "X-Sha256": r.run.sha256 } });
}
