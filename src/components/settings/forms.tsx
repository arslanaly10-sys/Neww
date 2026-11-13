"use client";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Monitor, Moon, Plus, Sun, UserCheck, UserX, X } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { inviteUserAction, savePrefsAction, setUserRoleAction, setUserStatusAction, updateProfileAction } from "@/app/users-actions";
import { cn } from "@/lib/cn";
import { Badge, Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
const SPRING = { type: "spring", bounce: 0, visualDuration: 0.3 } as const;
const Done = ({ text }: { text: string }) => (
  <motion.p role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{text}</motion.p>
);

export function ProfileForm({ v }: { v: { name: string; nameAr: string; title: string; titleAr: string } }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const id = useId();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.currentTarget).entries()); start(async () => { const r = await updateProfileAction(fd); setMsg(r.ok ? { ok: true, text: r.changed.length ? t("profileSaved") : t("noChanges") } : { ok: false, text: t(`err_${r.error}`) }); if (r.ok) router.refresh(); }); }} className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <div><label htmlFor={`${id}-n`} className={label}>{t("name")}</label><input id={`${id}-n`} name="name" required minLength={2} maxLength={80} defaultValue={v.name} className={field} /></div>
      <div><label htmlFor={`${id}-na`} className={label}>{t("nameAr")}</label><input id={`${id}-na`} name="nameAr" dir="rtl" lang="ar" required minLength={2} maxLength={80} defaultValue={v.nameAr} className={field} /></div>
      <div><label htmlFor={`${id}-t`} className={label}>{t("jobTitle")}</label><input id={`${id}-t`} name="title" maxLength={80} defaultValue={v.title} className={field} /></div>
      <div><label htmlFor={`${id}-ta`} className={label}>{t("jobTitleAr")}</label><input id={`${id}-ta`} name="titleAr" dir="rtl" lang="ar" maxLength={80} defaultValue={v.titleAr} className={field} /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" variant="gold" disabled={pending}>{t("saveProfile")}</Button>{msg && (msg.ok ? <Done text={msg.text} /> : <p role="alert" className="text-sm text-danger">{msg.text}</p>)}</div>
    </form>
  );
}

/** Shows the chosen theme at once, before it is saved: the same data-theme attribute the root layout sets. */
function applyTheme(x: "system" | "light" | "dark") {
  if (x === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", x);
}

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Language, currency, theme and first page. The theme applies at once; the rest from the next sign-in or page. */
export function PrefsForm({ v, landings }: { v: { lang: "en" | "ar"; currency: "EGP" | "USD"; theme: "system" | "light" | "dark"; landing: string }; landings: { id: string; label: string }[] }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const path = usePathname();
  const id = useId();
  const [theme, setTheme] = useState(v.theme);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preview = (x: typeof theme) => {
    setTheme(x);
    applyTheme(x);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.currentTarget).entries()); start(async () => { const r = await savePrefsAction({ ...fd, theme }); setMsg(r.ok ? t("prefsSaved") : t(`err_${r.error}`)); if (r.ok && r.prefs.lang) router.replace(path, { locale: r.prefs.lang }); }); }} className="max-w-2xl space-y-5">
      <fieldset>
        <legend className={label}>{t("theme")}</legend>
        <div role="radiogroup" aria-label={t("theme")} className="grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as const).map((x) => {
            const Icon = THEME_ICON[x];
            return (
              <button key={x} type="button" role="radio" aria-checked={theme === x} onClick={() => preview(x)}
                className={cn("relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 text-sm", theme === x ? "border-gold-fill" : "border-line hover:bg-surface-2")}>
                {theme === x && <motion.span layoutId={`${id}-theme`} className="absolute inset-0 -z-10 rounded-lg bg-surface-2" transition={SPRING} />}
                <Icon aria-hidden="true" size={18} className={theme === x ? "text-gold" : "text-muted"} />{t(`theme_${x}`)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor={`${id}-l`} className={label}>{t("lang")}</label><select id={`${id}-l`} name="lang" defaultValue={v.lang} className={field}><option value="en">English</option><option value="ar">العربية</option></select></div>
        <div><label htmlFor={`${id}-c`} className={label}>{t("currency")}</label><select id={`${id}-c`} name="currency" defaultValue={v.currency} className={field}><option value="EGP">EGP</option><option value="USD">USD</option></select></div>
        <div><label htmlFor={`${id}-p`} className={label}>{t("landing")}</label><select id={`${id}-p`} name="landing" defaultValue={v.landing} className={field}>{landings.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
      </div>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="gold" disabled={pending}>{t("savePrefs")}</Button>{msg && <Done text={msg} />}</div>
      <p className="text-xs text-muted">{t("prefsNote")}</p>
    </form>
  );
}

export interface AdminUser { id: string; name: string; email: string; role: string; title: string; status: string; lastSeen: string | null; me: boolean }

/** The administrator's list: change a role, deactivate or reactivate, invite someone new. Rows animate as they change. */
export function UsersAdmin({ rows }: { rows: AdminUser[] }) {
  const t = useTranslations("settings");
  const r = useTranslations("roles");
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; auditSeq: number | null } | { ok: false; error: string }>, okText: string) => start(async () => {
    const x = await fn();
    setMsg(x.ok ? { ok: true, text: x.auditSeq ? t("savedAudit", { seq: x.auditSeq, what: okText }) : t("noChanges") } : { ok: false, text: t(`err_${x.error}` as "err_invalid") });
    setConfirm(null);
    router.refresh();
  });
  const tone = (s: string) => (s === "active" ? "ok" : s === "invited" ? "gold" : "danger") as "ok" | "gold" | "danger";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InviteUser />
        <AnimatePresence mode="wait">{msg && <motion.div key={msg.text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{msg.ok ? <Done text={msg.text} /> : <p role="alert" className="text-sm text-danger">{msg.text}</p>}</motion.div>}</AnimatePresence>
      </div>
      <ul aria-label={t("usersTitle")} className="divide-y divide-line rounded-lg border border-line bg-surface">
        {rows.map((u) => (
          <motion.li key={u.id} layout transition={SPRING} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm", u.status === "deactivated" && "bg-surface-2/60")}>
            <div className="min-w-48 flex-1">
              <p className="font-semibold">{u.name}{u.me && <span className="text-muted"> ({t("you")})</span>}</p>
              <p className="text-xs text-muted"><span className="num">{u.email}</span>{u.title ? `, ${u.title}` : ""}</p>
            </div>
            <Badge tone={tone(u.status)}>{t(`st_${u.status}` as "st_active")}</Badge>
            <p className="w-36 text-xs text-muted">{u.lastSeen ? t("lastSeen", { when: u.lastSeen }) : t("neverSignedIn")}</p>
            <label className="text-xs"><span className="sr-only">{t("roleOf", { name: u.name })}</span>
              <select aria-label={t("roleOf", { name: u.name })} value={u.role} disabled={u.me || pending} onChange={(e) => run(() => setUserRoleAction(u.id, e.target.value), t("roleChanged", { name: u.name }))} className="min-h-10 rounded-md border border-line bg-bg px-2 text-sm disabled:opacity-60">
                {(["investor", "manager", "admin"] as const).map((x) => <option key={x} value={x}>{r(x)}</option>)}
              </select>
            </label>
            {!u.me && (u.status === "deactivated"
              ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setUserStatusAction(u.id, "active"), t("reactivated", { name: u.name }))}><UserCheck aria-hidden="true" size={14} />{t("reactivate")}</Button>
              : confirm === u.id
                ? <span className="flex items-center gap-2"><Button size="sm" variant="outline" className="border-danger text-danger" disabled={pending} onClick={() => run(() => setUserStatusAction(u.id, "deactivated"), t("deactivated", { name: u.name }))}>{t("deactivateYes")}</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>{t("cancel")}</Button></span>
                : <Button size="sm" variant="ghost" onClick={() => setConfirm(u.id)}><UserX aria-hidden="true" size={14} />{t("deactivate")}</Button>)}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function InviteUser() {
  const t = useTranslations("settings");
  const r = useTranslations("roles");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="gold" size="sm" onClick={() => { setErr(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("invite")}</Button>
      {done && <Done text={done} />}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[8vh] sm:bottom-auto sm:w-[30rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
            <div className="mb-3 flex items-start justify-between gap-3"><Dialog.Title className="font-display text-xl">{t("invite")}</Dialog.Title><Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close></div>
            <form onSubmit={(e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.currentTarget).entries()); start(async () => { const x = await inviteUserAction(fd); if (!x.ok) { setErr(t(`err_${x.error}`)); return; } setOpen(false); setDone(t("invited", { email: String(fd.email) })); router.refresh(); }); }} className="space-y-3">
              <div><label htmlFor={`${id}-n`} className={label}>{t("name")}</label><input id={`${id}-n`} name="name" required minLength={2} maxLength={80} className={field} /></div>
              <div><label htmlFor={`${id}-na`} className={label}>{t("nameAr")}</label><input id={`${id}-na`} name="nameAr" dir="rtl" lang="ar" maxLength={80} className={field} /></div>
              <div><label htmlFor={`${id}-e`} className={label}>{t("email")}</label><input id={`${id}-e`} name="email" type="email" dir="ltr" required maxLength={120} className={field} /></div>
              <div><label htmlFor={`${id}-r`} className={label}>{t("role")}</label><select id={`${id}-r`} name="role" defaultValue="investor" className={field}>{(["investor", "manager", "admin"] as const).map((x) => <option key={x} value={x}>{r(x)}</option>)}</select></div>
              <div><label htmlFor={`${id}-t`} className={label}>{t("jobTitle")}</label><input id={`${id}-t`} name="title" maxLength={80} className={field} /></div>
              <p className="text-xs text-muted">{t("inviteNote")}</p>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("sendInvite")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
