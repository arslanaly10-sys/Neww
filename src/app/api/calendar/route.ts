import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getCalendar } from "@/lib/calendar";
import { addDays } from "@/lib/calendar-dates";
import { toIcs } from "@/lib/ics";
import { appendAudit } from "@/lib/audit";
import { DEMO_TODAY } from "@/lib/assumptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Q = z.object({ lang: z.enum(["en", "ar"]).default("en") });

/** GET /api/calendar?lang=en|ar: the person's calendar from a month ago to a year ahead, as an .ics file. */
export async function GET(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return new Response("Bad request", { status: 400 });
  const items = await getCalendar(user, q.data.lang, addDays(DEMO_TODAY, -31), addDays(DEMO_TODAY, 365));
  if (!items) return new Response("Your role has no calendar.", { status: 403 });
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}/${q.data.lang}`;
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "calendar.export", entity: "calendar", entityId: user.id, detail: { lang: q.data.lang, items: items.length } });
  const body = toIcs(items, { name: q.data.lang === "ar" ? "تقويم زمنهوف" : "ZMNHOOF calendar", base, now: new Date() });
  return new Response(body, { headers: {
    "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="zmnhoof-calendar-${DEMO_TODAY}-${q.data.lang}.ics"`, "Cache-Control": "no-store", "X-Items": String(items.length),
  } });
}
