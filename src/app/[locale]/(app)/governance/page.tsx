import { getTranslations, setRequestLocale } from "next-intl/server";
import { sql } from "drizzle-orm";
import { Check, Minus, X } from "lucide-react";
import { getDb } from "@/db/client";
import { pageContext } from "@/lib/page";
import { PERMISSIONS, ROLES, type Permission } from "@/lib/permissions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { VerifyPack } from "@/components/pack/verify-pack";
import { ChainControls } from "@/components/audit/chain-controls";
import { listAudit, verifyChain } from "@/lib/audit-service";
import { can } from "@/lib/permissions";
import { Link } from "@/i18n/navigation";
import { dateFmt, listSep } from "@/lib/format";
import { getLeadsAndOutbox } from "@/lib/outbox";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("governance");

export default async function Governance({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; action?: string; p?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user } = await pageContext("governance");
  const t = await getTranslations("governance");
  const g = await getTranslations("gov2");
  const chain = await verifyChain();
  const isAdmin = can(user.role, "audit.view");
  const PAGE = 15;
  const page = Math.max(1, Number(sp.p) || 1);
  const audit = isAdmin ? await listAudit(user, { q: sp.q, action: sp.action, limit: PAGE, offset: (page - 1) * PAGE }) : null;
  const ar = locale === "ar";
  const inbox = await getLeadsAndOutbox(user);
  const ob = await getTranslations("outbox");
  const when = (d: Date) => d.toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
  const r = await getTranslations("roles");
  const db = await getDb();
  const pol = await db.execute(sql`select count(*)::int as n from pg_policies where schemaname = 'public'`);
  const n = (pol.rows[0] as { n: number }).n;

  const checks: { text: string; ok: boolean }[] = [
    { text: t("check.rls", { n }), ok: n > 0 },
    { text: t("check.separation"), ok: true },
    { text: t("check.cookie"), ok: true },
    { text: t("check.headers"), ok: true },
    { text: t("check.thirdParty"), ok: true },
    { text: chain.ok ? g("chainPosture") : g("chainPostureBad"), ok: chain.ok },
    { text: t("check.pack"), ok: true },
    { text: t("check.feed"), ok: true },
    { text: t("check.sso"), ok: false },
    { text: t("check.csp"), ok: false },
    { text: t("check.backup"), ok: false },
  ];
  const auditSection = (
      <section className={isAdmin ? "mb-10" : "mt-10"} aria-labelledby="audit">
        <h2 id="audit" className="font-display text-2xl">{g("audTitle")}</h2>
        <p className="mb-4 mt-1 max-w-md text-sm text-muted">{g("audLead")}</p>
        {!isAdmin || !audit ? <Card className="text-sm text-muted">{g("audAdminOnly")}</Card> : (
          <div className="space-y-6">
            {!sp.q && !sp.action && page === 1 && (
              <ol aria-label={g("stripLabel")} className="flex gap-1.5 overflow-x-auto pb-1">
                {[...audit.rows].slice(0, 6).reverse().map((e, i, arr) => {
                  const broken = !chain.ok && chain.firstBad?.seq === e.seq;
                  return (
                    <li key={e.seq} className="flex shrink-0 items-center gap-1.5">
                      <span className={`flex flex-col rounded-md border px-2.5 py-1.5 text-xs ${broken ? "border-danger bg-danger/10" : "border-line bg-surface"}`}>
                        <span className="num font-semibold text-gold">#{e.seq}</span>
                        <span className="num font-mono text-muted">{e.hash.slice(0, 8)}</span>
                        {broken && <span className="font-semibold text-danger">{g("stripBroken")}</span>}
                      </span>
                      {i < arr.length - 1 && <span aria-hidden="true" className={`h-px w-4 ${broken ? "bg-danger" : "bg-gold"}`} />}
                    </li>
                  );
                })}
              </ol>
            )}
            <ChainControls initial={chain} />
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div><label htmlFor="aq" className="mb-1 block text-xs font-semibold text-muted">{g("search")}</label><input id="aq" name="q" defaultValue={sp.q ?? ""} className="min-h-10 w-56 rounded-md border border-line bg-surface px-3 text-sm" /></div>
              <div><label htmlFor="aa" className="mb-1 block text-xs font-semibold text-muted">{g("colAction")}</label>
                <select id="aa" name="action" defaultValue={sp.action ?? ""} className="min-h-10 rounded-md border border-line bg-surface px-2 text-sm"><option value="">{g("allActions")}</option>{audit.actions.map((a) => <option key={a} value={a}>{g.has(`act_${a.replace(/\./g, "_")}`) ? g(`act_${a.replace(/\./g, "_")}` as "act_session_start") : a}</option>)}</select></div>
              <button type="submit" className="min-h-10 rounded-md border border-line px-4 text-sm font-semibold hover:bg-surface-2">{g("apply")}</button>
            </form>
            <ul className="space-y-2">
              {audit.rows.map((e) => {
                const label = g.has(`act_${e.action.replace(/\./g, "_")}`) ? g(`act_${e.action.replace(/\./g, "_")}` as "act_session_start") : e.action;
                const broken = !chain.ok && chain.firstBad?.seq === e.seq;
                return (
                  <li key={e.seq}>
                    <Card className={`p-3 text-sm ${broken ? "border-danger" : ""}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p><span className="num font-semibold text-gold">#{e.seq}</span> <span className="font-semibold">{label}</span> <span className="num text-xs text-muted">{e.action}</span></p>
                        <bdi className="text-xs text-muted">{dateFmt(e.at.slice(0, 10), locale)} {e.at.slice(11, 16)}</bdi>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{e.actorId === "system" ? g("system") : ar ? e.actorNameAr : e.actorName}{listSep(locale)}<span className="num">{e.entity} {e.entityId}</span>{listSep(locale)}<span className="num font-mono">{e.hash.slice(0, 12)}…</span></p>
                      <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">{g("detail")}</summary>
                        <pre dir="ltr" className="mt-1 overflow-x-auto rounded bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(e.detail, null, 1)}</pre>
                        <p dir="ltr" className="mt-1 break-all font-mono text-xs">{g("prevHash")}: {e.prevHash}</p><p dir="ltr" className="break-all font-mono text-xs">{g("fullHash")}: {e.hash}</p></details>
                    </Card>
                  </li>
                );
              })}
            </ul>
            <nav className="flex items-center justify-between gap-3 text-sm" aria-label={g("audTitle")}>
              <span className="text-muted">{g("showing", { from: audit.total === 0 ? 0 : (page - 1) * PAGE + 1, to: Math.min(page * PAGE, audit.total), n: audit.total })}</span>
              <span className="flex gap-2">
                {page > 1 && <Link className="rounded-md border border-line px-3 py-2 hover:bg-surface-2" href={{ pathname: "/governance", query: { ...(sp.q ? { q: sp.q } : {}), ...(sp.action ? { action: sp.action } : {}), p: page - 1 } }}>{g("prev")}</Link>}
                {page * PAGE < audit.total && <Link className="rounded-md border border-line px-3 py-2 hover:bg-surface-2" href={{ pathname: "/governance", query: { ...(sp.q ? { q: sp.q } : {}), ...(sp.action ? { action: sp.action } : {}), p: page + 1 } }}>{g("next")}</Link>}
              </span>
            </nav>
          </div>
        )}
      </section>
  );
  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")} />
      {isAdmin && auditSection}
      <section>
        <h2 className="mb-3 font-display text-2xl">{t("matrix")}</h2>
        <ul className="divide-y divide-line rounded-lg border border-line md:hidden">
          {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
            <li key={p} className="p-3 text-sm">
              <p className="mb-1.5">{t(`perm.${p.replace(/\./g, "_")}` as "perm.portfolio_view")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {ROLES.map((role) => (
                  <li key={role}>
                    <Badge tone={PERMISSIONS[p][role] ? "ok" : "muted"} className={cn("", role === user.role && "ring-1 ring-gold")}>
                      {r(role)}: {PERMISSIONS[p][role] ? t("allowed") : t("denied")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-hidden rounded-lg border border-line md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("matrix")}</caption>
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("matrix")}</th>
                {ROLES.map((role) => <th key={role} scope="col" className={cn("px-2 py-2.5 text-center font-semibold", role === user.role && "text-gold")}>{r(role)}</th>)}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
                <tr key={p} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-start font-normal">{t(`perm.${p.replace(/\./g, "_")}` as "perm.portfolio_view")}</th>
                  {ROLES.map((role) => (
                    <td key={role} className="px-2 py-2 text-center">
                      {PERMISSIONS[p][role]
                        ? <><Check aria-hidden="true" size={16} className="mx-auto text-ok" /><span className="sr-only">{t("allowed")}</span></>
                        : <><Minus aria-hidden="true" size={16} className="mx-auto text-muted" /><span className="sr-only">{t("denied")}</span></>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-2xl">{t("posture")}</h2>
        <p className="mb-3 text-sm text-muted">{t("postureLead")}</p>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.text}>
              <Card className="flex items-start gap-3 p-3.5 text-sm">
                {c.ok ? <Check aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-ok" /> : <X aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-muted" />}
                <span className="flex-1">{c.text}</span>
                <Badge tone={c.ok ? "ok" : "muted"}>{c.ok ? t("pass") : t("gap")}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10"><VerifyPack /></section>
      {!isAdmin && auditSection}
      {inbox && (
        <section className="mt-10" aria-labelledby="outbox">
          <h2 id="outbox" className="font-display text-2xl">{ob("title")}</h2>
          <p className="mb-3 max-w-md text-sm text-muted">{ob("lead")}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="font-semibold">{ob("leads", { n: inbox.leads.length })}</h3>
              {inbox.leads.length === 0 ? <p className="mt-2 text-sm text-muted">{ob("leadsEmpty")}</p> : (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {inbox.leads.map((l) => (
                    <li key={l.id} className="py-2">
                      <p className="font-semibold">{l.name}{l.company ? `${listSep(locale)}${l.company}` : ""}</p>
                      <p className="text-muted"><bdi>{l.email}</bdi>{listSep(locale)}{when(l.createdAt)}</p>
                      {l.message && <p className="mt-1">{l.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold">{ob("mail", { n: inbox.outbox.length })}</h3>
              {inbox.outbox.length === 0 ? <p className="mt-2 text-sm text-muted">{ob("mailEmpty")}</p> : (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {inbox.outbox.map((m) => (
                    <li key={m.id} className="py-2">
                      <details>
                        <summary className="cursor-pointer"><span className="font-semibold">{m.subject}</span><span className="block text-muted">{ob("to")} <bdi>{m.to}</bdi>{listSep(locale)}{when(m.createdAt)}</span></summary>
                        <p className="mt-2 whitespace-pre-line text-muted">{m.body}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
