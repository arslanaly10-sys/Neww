import { z } from "zod";
import { getCurrency, getCurrentUser } from "@/lib/session";
import { askHorus } from "@/lib/horus/gateway";
import { getThread, saveTurn } from "@/lib/horus/history";
import type { HorusAnswer } from "@/lib/horus/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  question: z.string().trim().min(1).max(600),
  locale: z.enum(["en", "ar"]),
  mode: z.enum(["portfolio", "help"]).default("portfolio"),
  threadId: z.string().regex(/^T-[0-9a-f]{10}$/).nullable().optional(),
  fileIds: z.array(z.string().regex(/^F-[0-9a-f]{8}$/)).max(5).default([]),
});

/**
 * Ask Horus, streamed as newline-delimited JSON:
 *   {"type":"step","tool":"portfolio_summary"}   once per tool Horus calls, as it happens
 *   {"type":"answer","answer":{...},"threadId":"T-..."}   the verified answer, once every claim has passed the checks
 * Text is never streamed before it is verified: a claim the citation checks would remove is never shown.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const b = parsed.data;
  const currency = await getCurrency();
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const prior = b.threadId ? await getThread(user, b.threadId) : null;
  const history = prior && prior.mode === b.mode ? prior.turns.map((t) => ({ q: t.q, a: t.a })) : [];
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let answer: HorusAnswer;
      try {
        answer = await askHorus(user, b.question, b.locale, currency, { ip }, { mode: b.mode, history, fileIds: b.fileIds, onStep: (tool) => send({ type: "step", tool }) });
      } catch (e) {
        console.error("[horus] request failed:", (e as Error).message);
        answer = { question: b.question, mode: "scripted", notice: "error", blocks: [], cannotVerify: true, dropped: 0, draft: null, advice: false };
      }
      let threadId: string | null = prior?.id ?? null;
      try { threadId = await saveTurn(user, prior && prior.mode === b.mode ? prior.id : null, b.mode, b.question, answer, b.fileIds); } catch (e) { console.error("[horus] could not save the turn:", (e as Error).message); }
      send({ type: "answer", answer, threadId });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
