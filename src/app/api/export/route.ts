import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { buildDataset, canExport, toCsv, toXlsx, type DatasetId } from "@/lib/exports";
import { appendAudit } from "@/lib/audit";
import { DEMO_TODAY } from "@/lib/assumptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Q = z.object({ dataset: z.string().regex(/^[a-z_]+$/), format: z.enum(["csv", "xlsx"]), lang: z.enum(["en", "ar"]).default("en") });

/** GET /api/export?dataset=holdings&format=csv|xlsx&lang=en|ar: one dataset, built under the user's own permissions. */
export async function GET(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return new Response("Bad request", { status: 400 });
  if (!canExport(user.role, q.data.dataset)) return new Response("Your role cannot export this.", { status: 403 });
  const table = await buildDataset(user, q.data.dataset as DatasetId, q.data.lang);
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "export.download", entity: "dataset", entityId: q.data.dataset, detail: { format: q.data.format, lang: q.data.lang, rows: table.rows.length } });
  const name = `zmnhoof-${q.data.dataset}-${DEMO_TODAY}-${q.data.lang}.${q.data.format}`;
  const body = q.data.format === "csv" ? new TextEncoder().encode(toCsv(table, q.data.lang)) : new Uint8Array(await toXlsx([{ name: q.data.dataset, table }], q.data.lang));
  return new Response(body, { headers: {
    "Content-Type": q.data.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Rows": String(table.rows.length),
  } });
}
