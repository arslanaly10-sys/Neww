import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { generateStatement, STATEMENT_PERIODS } from "@/lib/statements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Q = z.object({ period: z.enum(STATEMENT_PERIODS), lang: z.enum(["en", "ar"]).default("en") });

/** GET /api/statement?period=2026|2026-Q3&lang=en|ar: the investor statement as a PDF. */
export async function GET(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return new Response("Bad request", { status: 400 });
  const r = await generateStatement(user, q.data.period, q.data.lang);
  if (!r.ok) return new Response("Your role cannot generate statements.", { status: 403 });
  return new Response(new Uint8Array(r.buffer), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="zmnhoof-statement-${q.data.period}-${q.data.lang}-${r.id}.pdf"`,
    "Cache-Control": "no-store", "X-Statement-Id": r.id, "X-Content-Hash": r.contentHash,
  } });
}
