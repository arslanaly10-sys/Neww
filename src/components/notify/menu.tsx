"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Popover from "@radix-ui/react-popover";
import { CheckCheck, Inbox } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { latestNotificationsAction, markReadAction, setPrefsAction, unreadCountAction } from "@/app/notify-actions";
import type { NotificationView } from "@/lib/notify";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/time-ago";
import { Button } from "../ui";

/** The inbox in the top bar: unread count, the latest eight, mark read. The count refreshes every minute and on focus. */
export function NotificationsMenu({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations("ntf");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(() => { unreadCountAction().then(setUnread).catch(() => {}); }, []);
  useEffect(() => {
    const id = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(id); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  const load = () => start(async () => { const r = await latestNotificationsAction(locale); setItems(r.items); setUnread(r.unread); });
  const readOne = (n: NotificationView) => { if (!n.read) { void markReadAction([n.id]); setUnread((u) => Math.max(0, u - 1)); } setOpen(false); };
  const readAll = () => start(async () => { await markReadAction("all"); setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null); setUnread(0); router.refresh(); });

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <Popover.Trigger className="relative grid size-11 place-items-center rounded-md border border-line hover:bg-surface-2 md:size-9" aria-label={unread ? t("openUnread", { n: unread }) : t("open")}>
        <Inbox aria-hidden="true" size={16} />
        {unread > 0 && <span aria-hidden="true" className="num absolute -end-1.5 -top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface shadow-md" aria-label={t("title")}>
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="font-display text-lg">{t("title")}</p>
            {unread > 0 && <Button size="sm" variant="ghost" disabled={pending} onClick={readAll}><CheckCheck aria-hidden="true" size={14} />{t("markAll")}</Button>}
          </div>
          {!items ? <p role="status" className="px-4 py-6 text-sm text-muted">{t("loading")}</p>
            : items.length === 0 ? <p className="px-4 py-6 text-sm text-muted">{t("empty")}</p>
            : (
              <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link href={n.link ?? "/notifications"} onClick={() => readOne(n)} className={cn("flex gap-3 px-4 py-3 text-sm hover:bg-surface-2", !n.read && "bg-gold-fill/10")}>
                      <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-gold-fill")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block", !n.read && "font-semibold")}>{n.title}{!n.read && <span className="sr-only"> ({t("unread")})</span>}</span>
                        {n.body && <span className="block text-xs text-muted">{n.body}</span>}
                        <span className="block text-xs text-muted">{timeAgo(n.createdAt, locale)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          <div className="border-t border-line px-4 py-2.5 text-sm"><Link href="/notifications" onClick={() => setOpen(false)} className="text-gold underline underline-offset-4">{t("seeAll")}</Link></div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Mark-as-read controls on the inbox page. */
export function InboxActions({ hasUnread }: { hasUnread: boolean }) {
  const t = useTranslations("ntf");
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!hasUnread) return null;
  return <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await markReadAction("all"); router.refresh(); })}><CheckCheck aria-hidden="true" size={14} />{t("markAll")}</Button>;
}
export function MarkOneRead({ id }: { id: string }) {
  const t = useTranslations("ntf");
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await markReadAction([id]); router.refresh(); })}>{t("markRead")}</Button>;
}

/** Per category: in the app, by email. Saved together. */
export function PrefsForm({ prefs }: { prefs: { category: string; inApp: boolean; email: boolean }[] }) {
  const t = useTranslations("ntf");
  const router = useRouter();
  const [state, setState] = useState(prefs);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (c: string, k: "inApp" | "email", v: boolean) => setState((s) => s.map((x) => (x.category === c ? { ...x, [k]: v } : x)));
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await setPrefsAction(state); setMsg(r.ok ? t("saved") : t("saveFailed")); router.refresh(); }); }}>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[28rem] text-sm">
          <caption className="sr-only">{t("prefsTitle")}</caption>
          <thead><tr className="border-b border-line text-xs text-muted"><th className="px-4 py-2 text-start font-semibold">{t("category")}</th><th className="px-4 py-2 text-center font-semibold">{t("inApp")}</th><th className="px-4 py-2 text-center font-semibold">{t("email")}</th></tr></thead>
          <tbody>
            {state.map((p) => (
              <tr key={p.category} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2 text-start font-normal"><span className="block font-semibold">{t(`c_${p.category}` as "c_work")}</span><span className="text-xs text-muted">{t(`cHelp_${p.category}` as "cHelp_work")}</span></th>
                <td className="px-4 py-2 text-center"><input type="checkbox" checked={p.inApp} onChange={(e) => set(p.category, "inApp", e.target.checked)} aria-label={t("inAppFor", { c: t(`c_${p.category}` as "c_work") })} className="size-5 accent-[var(--gold-fill)]" /></td>
                <td className="px-4 py-2 text-center"><input type="checkbox" checked={p.email} onChange={(e) => set(p.category, "email", e.target.checked)} aria-label={t("emailFor", { c: t(`c_${p.category}` as "c_work") })} className="size-5 accent-[var(--gold-fill)]" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><Button type="submit" variant="gold" disabled={pending}>{t("savePrefs")}</Button>{msg && <p role="status" className="text-sm text-ok">{msg}</p>}</div>
      <p className="mt-2 text-xs text-muted">{t("emailNote")}</p>
    </form>
  );
}
