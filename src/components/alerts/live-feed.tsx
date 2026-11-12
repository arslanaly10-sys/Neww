"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { Activity, Banknote, MessageCircle, Scale, Server } from "lucide-react";
import { money, pct, type Currency } from "@/lib/format";
import type { FeedEvent } from "@/lib/feed";
import { Badge, Card } from "../ui";

const ICON = { rent_receipt: Banknote, valuation_change: Scale, new_enquiry: MessageCircle, system: Server } as const;

/** Server-sent simulated activity. Clearly labelled, never stored, reconnects by itself. */
export function LiveFeed({ currency, fx, limit = 8, compact = false }: { currency: Currency; fx: number; limit?: number; compact?: boolean }) {
  const t = useTranslations("al");
  const locale = useLocale();
  const ar = locale === "ar";
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener("activity", (m) => {
      try { const e = JSON.parse((m as MessageEvent).data) as FeedEvent; setEvents((p) => [e, ...p].slice(0, limit)); setLive(true); } catch { /* ignore a malformed event */ }
    });
    return () => es.close();
  }, [limit]);

  const text = (e: FeedEvent) => {
    const asset = (ar ? e.assetNameAr : e.assetName) ?? "";
    switch (e.kind) {
      case "rent_receipt": return e.amountEgp ? t("f_rent_amount", { asset, amount: money(e.currency === "USD" ? e.amountEgp * fx : e.amountEgp, currency, locale, { fx }) }) : t("f_rent", { asset });
      case "valuation_change": return t("f_valuation", { asset, pct: `${(e.changePct ?? 0) > 0 ? "+" : ""}${pct((e.changePct ?? 0) / 100, locale)}` });
      case "new_enquiry": return t("f_enquiry", { asset, channel: t(`ch_${e.channel}` as "ch_web"), prospect: String(e.prospect) });
      default: return t(`f_system_${e.systemKey}` as "f_system_chain_checkpoint");
    }
  };
  const when = (iso: string) => new Intl.DateTimeFormat(ar ? "ar-EG-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl"><Activity aria-hidden="true" size={18} className="text-gold" />{t("feedTitle")}</h2>
        <span className="flex items-center gap-2"><Badge tone="gold">{t("feedSimulated")}</Badge><span className="text-xs text-muted" role="status">{live ? t("connected") : t("reconnecting")}</span></span>
      </div>
      <p className="mb-3 text-xs text-muted">{t("feedNote")}</p>
      <ul aria-live="polite" aria-relevant="additions" className={`relative ${compact ? "space-y-2" : "space-y-3"}`}>
        {events.length === 0 && <li className="text-sm text-muted">{t("feedEmpty")}</li>}
        <AnimatePresence initial={false} mode="popLayout">
        {events.map((e) => {
          const I = ICON[e.kind];
          return (
            <motion.li key={e.seq} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-3 text-sm">
              <I aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-gold" />
              <span className="min-w-0 flex-1">{text(e)} <span className="text-xs text-muted">{t("feedSimulated")}</span></span>
              <bdi className="shrink-0 text-xs text-muted">{when(e.at)}</bdi>
            </motion.li>
          );
        })}
        </AnimatePresence>
      </ul>
    </Card>
  );
}
