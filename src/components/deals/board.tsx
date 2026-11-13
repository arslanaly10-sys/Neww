"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, LayoutGroup, motion, useInView } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, GripVertical, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { moveDealAction } from "@/app/deals-actions";
import { cn } from "@/lib/cn";
import { Button } from "../ui";

export const STAGES = ["sourcing", "screening", "due_diligence", "offer", "negotiation", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export interface Card { id: string; title: string; kind: "buy" | "sell"; stage: Stage; position: number; place: string; price: string; marketDiff: number | null; owner: string; close: string | null; overdue: boolean; shared: boolean }

const SPRING = { type: "spring", bounce: 0.12, visualDuration: 0.35 } as const;
const TONE: Record<Stage, string> = { sourcing: "bg-muted", screening: "bg-muted", due_diligence: "bg-teal", offer: "bg-gold-fill", negotiation: "bg-gold-fill", won: "bg-ok", lost: "bg-danger" };

function MarketChip({ diff }: { diff: number | null }) {
  const t = useTranslations("deals");
  const locale = useLocale();
  if (diff === null) return null;
  const pct = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(diff);
  const tone = Math.abs(diff) < 0.05 ? "text-muted" : diff > 0 ? "text-danger" : "text-ok";
  return <span className={cn("text-xs", tone)}>{t("vsMarket", { pct })}</span>;
}

/**
 * The pipeline board. Managers drag a card to another column (or another place in its column), or use its "Move to"
 * menu from the keyboard; the card glides to its new place (shared layout animation) and the move is saved. Losing a
 * deal asks for the reason first. Investors see the same board without the controls.
 */
export function DealBoard({ cards, canManage, focus }: { cards: Card[]; canManage: boolean; focus?: Stage | null }) {
  const t = useTranslations("deals");
  const router = useRouter();
  const [items, setItems] = useState(cards);
  const [given, setGiven] = useState(cards);
  if (given !== cards) { setGiven(cards); setItems(cards); } // new data from the server replaces local moves
  const [err, setErr] = useState<string | null>(null);
  const [lost, setLost] = useState<{ id: string; position: number } | null>(null);
  const [reason, setReason] = useState("");
  const [, start] = useTransition();
  const cols = useRef(new Map<Stage, HTMLElement>());
  useEffect(() => { if (focus) cols.current.get(focus)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }, [focus]);

  const column = (s: Stage, list = items) => list.filter((x) => x.stage === s).sort((a, b) => a.position - b.position);
  const apply = (id: string, stage: Stage, position: number, why = "") => {
    const before = items;
    const moving = items.find((x) => x.id === id);
    if (!moving) return;
    const rest = column(stage).filter((x) => x.id !== id);
    rest.splice(Math.min(position, rest.length), 0, { ...moving, stage });
    const placed = new Map(rest.map((x, i) => [x.id, i]));
    setItems(items.map((x) => (placed.has(x.id) ? { ...x, stage, position: placed.get(x.id)! } : x.id === id ? { ...x, stage } : x)));
    setErr(null);
    start(async () => {
      const r = await moveDealAction(id, { stage, position, reason: why });
      if (!r.ok) { setItems(before); setErr(t(`err_${r.error}`)); return; }
      router.refresh();
    });
  };
  const request = (id: string, stage: Stage, position: number) => {
    if (stage === "lost") { setReason(""); setLost({ id, position }); return; }
    apply(id, stage, position);
  };
  const dropAt = (id: string, x: number, y: number) => {
    const el = document.elementsFromPoint(x, y).find((e) => (e as HTMLElement).dataset?.stage) as HTMLElement | undefined;
    if (!el) return;
    const stage = el.dataset.stage as Stage;
    const others = [...el.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => c.dataset.card !== id);
    const position = others.filter((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2 < y; }).length;
    const cur = items.find((c) => c.id === id)!;
    if (stage === cur.stage && column(stage).findIndex((c) => c.id === id) === position) return;
    request(id, stage, position);
  };

  return (
    <div>
      {err && <p role="alert" className="mb-2 text-sm text-danger">{err}</p>}
      <LayoutGroup>
        <div className="-mx-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]">
          <div className="grid min-w-max auto-cols-[16rem] grid-flow-col gap-3">
            {STAGES.map((s) => {
              const list = column(s);
              return (
                <section key={s} ref={(el) => { if (el) cols.current.set(s, el); }} data-stage={s} aria-labelledby={`col-${s}`}
                  className={cn("flex min-h-64 flex-col rounded-xl border bg-surface-2/40 p-2 transition-colors", focus === s ? "border-gold-fill" : "border-line")}>
                  <h3 id={`col-${s}`} className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
                    <span aria-hidden="true" className={cn("size-2 rounded-full", TONE[s])} />{t(`s_${s}`)}<span className="num ms-auto text-xs text-muted">{list.length}</span>
                  </h3>
                  <ol className="flex flex-1 flex-col gap-2" aria-label={t(`s_${s}`)}>
                    <AnimatePresence initial={false}>
                      {list.map((c) => (
                        <motion.li key={c.id} layoutId={c.id} layout transition={SPRING} data-card={c.id}
                          drag={canManage} dragSnapToOrigin dragElastic={0.6} whileDrag={{ scale: 1.04, zIndex: 40, boxShadow: "0 12px 30px rgba(0,0,0,.25)", cursor: "grabbing" }}
                          onDragEnd={(e, info) => dropAt(c.id, info.point.x - window.scrollX, info.point.y - window.scrollY)}
                          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                          className={cn("relative rounded-lg border border-line bg-surface p-3 text-sm shadow-sm", canManage && "cursor-grab touch-none")}>
                          <div className="flex items-start gap-1.5">
                            {canManage && <GripVertical aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-muted" />}
                            <Link href={`/deals/${c.id}`} className="min-w-0 flex-1 font-semibold leading-snug underline-offset-4 hover:underline" draggable={false}>{c.title}</Link>
                          </div>
                          <p className="mt-1 text-xs text-muted"><span className="num">{c.id}</span>, {t(`k_${c.kind}`)}, {c.place}</p>
                          <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2"><span className="num font-semibold">{c.price}</span><MarketChip diff={c.marketDiff} /></p>
                          <p className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted">
                            <span>{c.owner}</span>
                            {c.close && <span className={cn(c.overdue && "flex items-center gap-1 text-danger")}>{c.overdue && <AlertTriangle aria-hidden="true" size={12} />}{c.close}</span>}
                          </p>
                          {canManage && (
                            <label className="mt-2 block text-xs">
                              <span className="sr-only">{t("moveLabel", { id: c.id })}</span>
                              <select value={c.stage} onChange={(e) => request(c.id, e.target.value as Stage, column(e.target.value as Stage).length)} onPointerDownCapture={(e) => e.stopPropagation()}
                                className="min-h-9 w-full rounded-md border border-line bg-bg px-2 text-xs" aria-label={t("moveLabel", { id: c.id })}>
                                {STAGES.map((x) => <option key={x} value={x}>{x === c.stage ? t(`s_${x}`) : t("moveTo", { stage: t(`s_${x}`) })}</option>)}
                              </select>
                            </label>
                          )}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                    {!list.length && <li className="grid flex-1 place-items-center rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">{canManage ? t("dropHere") : t("emptyCol")}</li>}
                  </ol>
                </section>
              );
            })}
          </div>
        </div>
      </LayoutGroup>
      <Dialog.Root open={!!lost} onOpenChange={(o) => { if (!o) setLost(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[20vh] sm:bottom-auto sm:w-[26rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
            <div className="mb-3 flex items-start justify-between gap-3"><Dialog.Title className="font-display text-xl">{t("lostTitle")}</Dialog.Title><Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close></div>
            <form onSubmit={(e) => { e.preventDefault(); if (lost && reason.trim().length >= 3) { apply(lost.id, "lost", lost.position, reason.trim()); setLost(null); } }} className="space-y-3">
              <label className="block text-sm font-semibold" htmlFor="lost-reason">{t("lostReason")}</label>
              <textarea id="lost-reason" required minLength={3} maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm" />
              <div className="flex gap-2"><Button type="submit" variant="gold">{t("markLost")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** The funnel: one bar per stage, wide by its count, drawn in when seen. Choosing a stage shows its column. */
export function DealFunnel({ rows, onPick, picked }: { rows: { stage: Stage; count: number; value: string }[]; onPick?: (s: Stage) => void; picked?: Stage | null }) {
  const t = useTranslations("deals");
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const max = Math.max(1, ...rows.map((r) => r.count));
  const id = useId();
  return (
    <div ref={ref}>
      <h3 id={`${id}-h`} className="mb-3 font-display text-xl">{t("funnel")}</h3>
      <ol aria-labelledby={`${id}-h`} className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.stage}>
            <button type="button" onClick={() => onPick?.(r.stage)} aria-pressed={picked === r.stage}
              className={cn("group grid w-full grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1 text-start text-sm", picked === r.stage ? "bg-surface-2" : "hover:bg-surface-2/60")}>
              <span className="truncate">{t(`s_${r.stage}`)}</span>
              <span className="flex items-center gap-2">
                <span className="relative h-6 flex-1">
                  <motion.span className={cn("absolute inset-y-0 start-0 rounded", TONE[r.stage], r.stage === "lost" && "opacity-70")} style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, originX: 0 }}
                    initial={{ scaleX: 0 }} animate={{ scaleX: seen ? 1 : 0 }} transition={{ type: "spring", bounce: 0, visualDuration: 0.6, delay: seen ? i * 0.07 : 0 }} />
                </span>
                <span className="w-32 shrink-0 text-end text-xs"><span className="num font-semibold">{r.count}</span> <span className="num text-muted">{r.value}</span></span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Funnel and board together, so choosing a stage in the funnel brings its column into view. */
export function Pipeline({ cards, funnel, canManage }: { cards: Card[]; funnel: { stage: Stage; count: number; value: string }[]; canManage: boolean }) {
  const [picked, setPicked] = useState<Stage | null>(null);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-4"><DealFunnel rows={funnel} picked={picked} onPick={(s) => setPicked((p) => (p === s ? null : s))} /></div>
      <DealBoard cards={cards} canManage={canManage} focus={picked} />
    </div>
  );
}
