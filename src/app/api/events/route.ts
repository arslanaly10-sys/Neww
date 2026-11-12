import { getCurrentUser } from "@/lib/session";
import { getPortfolio } from "@/lib/access";
import { can } from "@/lib/permissions";
import { feedEvent, gapMs, type FeedAsset } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Server-sent events: a simulated activity stream for the demo, filtered by role. Events are never written to the database. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  let assets: FeedAsset[] = [];
  if (user.role !== "admin" && can(user.role, "portfolio.view")) {
    assets = (await getPortfolio(user)).map((r) => ({ id: r.id, name: r.name, nameAr: r.nameAr, occupancy: r.occupancy, tenant: r.lease?.tenant.name ?? null, monthlyRent: r.lease?.monthlyRent ?? null, currency: r.lease?.currency ?? null }));
  }
  const fixed = Number(process.env.ZOS_FEED_INTERVAL_MS) || undefined; // tests set a short fixed interval
  const enc = new TextEncoder();
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, beat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { /* closed */ } };
      send(`retry: 5000\n: connected\n\n`);
      const next = () => {
        const ev = feedEvent(seq, user.role, assets, new Date().toISOString());
        send(`id: ${seq}\nevent: activity\ndata: ${JSON.stringify(ev)}\n\n`);
        seq++;
        timer = setTimeout(next, gapMs(seq, fixed));
      };
      timer = setTimeout(next, gapMs(0, fixed));
      beat = setInterval(() => send(`: ping\n\n`), 15000);
      req.signal.addEventListener("abort", () => { clearTimeout(timer); clearInterval(beat); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel() { clearTimeout(timer); clearInterval(beat); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
