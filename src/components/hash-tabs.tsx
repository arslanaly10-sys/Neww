"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface HashTab { id: string; label: string; count?: number; content: ReactNode }

/**
 * Tabs whose selection lives in the address hash (#queue, #register), so links, the back button and reloads land on the
 * right tab. Keyboard: arrow keys move between tabs, Home and End jump. Panels are rendered on the server; inactive
 * ones are hidden. Without JavaScript the first tab is shown.
 */
export function HashTabs({ tabs, label }: { tabs: HashTab[]; label: string }) {
  const [active, setActive] = useState(tabs[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const sync = () => { const h = window.location.hash.slice(1); if (tabs.some((t) => t.id === h)) setActive(h); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [tabs]);
  const select = (id: string, focus = false) => {
    setActive(id);
    window.history.replaceState(null, "", id === tabs[0].id ? window.location.pathname + window.location.search : `#${id}`);
    if (focus) refs.current[id]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const rtl = document.documentElement.dir === "rtl";
    const next = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>;
    if (e.key in next) { e.preventDefault(); select(tabs[(i + next[e.key] + tabs.length) % tabs.length].id, true); }
    if (e.key === "Home") { e.preventDefault(); select(tabs[0].id, true); }
    if (e.key === "End") { e.preventDefault(); select(tabs[tabs.length - 1].id, true); }
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={cn("-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold", active === t.id ? "border-gold text-text" : "border-transparent text-muted hover:text-text")}>
            {t.label}{t.count !== undefined && <span className="num rounded-full bg-surface-2 px-1.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="pt-6" tabIndex={-1}>
          <span id={t.id} className="block scroll-mt-24" aria-hidden="true" />
          {t.content}
        </div>
      ))}
    </div>
  );
}
