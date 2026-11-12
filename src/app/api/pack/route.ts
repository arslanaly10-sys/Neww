import { z } from "zod";
import { getCurrency, getCurrentUser } from "@/lib/session";
import { generatePack } from "@/lib/pack/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/pack?lang=en|ar: generate and download the investor pack for the signed-in user. */
export async function GET(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const lang = z.enum(["en", "ar"]).safeParse(new URL(req.url).searchParams.get("lang") ?? "en");
  if (!lang.success) return new Response("Bad language", { status: 400 });
  const r = await generatePack(user, lang.data, await getCurrency());
  if (!r.ok) return new Response("Your role cannot generate the investor pack.", { status: 403 });
  return new Response(new Uint8Array(r.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="zmnhoof-investor-pack-${lang.data}-${r.id}.pdf"`,
      "Cache-Control": "no-store",
      "X-Pack-Id": r.id,
    },
  });
}
