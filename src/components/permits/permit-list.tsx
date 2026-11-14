import { getTranslations } from "next-intl/server";
import { CheckCircle2, Clock, FileWarning, ShieldQuestion } from "lucide-react";
import type { assetPermits } from "@/lib/permits";
import type { PermitState } from "@/lib/permits-rules";
import { DEMO_TODAY } from "@/lib/assumptions";
import { dateFmt } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "../ui";
import { PermitReview, RecordPermit } from "./controls";

export const STATE_TONE = { ok: "ok", attention: "gold", expiring: "gold", pending: "teal", action: "danger" } as const;
export const STATE_ICON = { ok: CheckCircle2, attention: ShieldQuestion, expiring: Clock, pending: Clock, action: FileWarning } as const;
type Data = NonNullable<Awaited<ReturnType<typeof assetPermits>>>;

/** One asset's permits: state, dates, evidence, who checked it, and the controls the viewer's role allows. */
export async function PermitList({ data, locale, edit, verify, me }: { data: Data; locale: string; edit: boolean; verify: boolean; me: string }) {
  const t = await getTranslations("permits");
  const ar = locale === "ar";
  const D = (d: string | null) => (d ? dateFmt(d, locale) : "–");
  const c = data.compliance;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={STATE_TONE[c.state]}>{t(`as_${c.state}`)}</Badge>
        <span>{t("inOrderOf", { good: c.good, n: c.required })}</span>
      </div>
      <ul className="space-y-3" aria-label={t("listLabel")}>
        {data.items.map(({ kind, required, permit: p, state }) => {
          const Icon = STATE_ICON[state.state as PermitState];
          const what = t("whatFor", { kind: t(`k_${kind}`), asset: data.asset.id });
          return (
            <li key={kind} className={cn("rounded-xl border bg-surface p-4 text-sm", state.state === "action" ? "border-danger/60" : "border-line")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="flex flex-wrap items-center gap-2 font-semibold"><Icon aria-hidden="true" size={16} className={cn(state.state === "ok" ? "text-ok" : state.state === "action" ? "text-danger" : state.state === "pending" ? "text-teal" : "text-gold")} />{t(`k_${kind}`)}{!required && <Badge tone="muted">{t("notRequired")}</Badge>}</h3>
                  <p className={cn(state.state === "action" && "font-semibold text-danger")}>{state.reason === "expiring" ? t("r_expiring", { days: state.days ?? 0 }) : state.reason === "expired" && state.days !== null ? t("r_expiredAgo", { days: -state.days }) : t(`r_${state.reason}`)}</p>
                  <p className="text-muted">{t(`kh_${kind}`)}</p>
                </div>
                {p && <Badge tone={p.verification === "verified" ? "ok" : p.verification === "disputed" ? "danger" : "muted"}>{t(`v_${p.verification}`)}</Badge>}
              </div>
              {p && (
                <dl className="mt-3 grid gap-2 sm:grid-cols-4">
                  {p.form && <div><dt className="text-xs text-muted">{t("form")}</dt><dd>{t(`tf_${p.form}`)}</dd></div>}
                  <div><dt className="text-xs text-muted">{t("authority")}</dt><dd>{p.authority || "–"}</dd></div>
                  <div><dt className="text-xs text-muted">{t("reference")}</dt><dd dir="ltr" className="text-start">{p.reference || "–"}</dd></div>
                  {p.appliedOn && <div><dt className="text-xs text-muted">{t("appliedOn")}</dt><dd>{D(p.appliedOn)}</dd></div>}
                  {p.issuedOn && <div><dt className="text-xs text-muted">{t("issuedOn")}</dt><dd>{D(p.issuedOn)}</dd></div>}
                  <div><dt className="text-xs text-muted">{t("expiresOn")}</dt><dd>{p.expiresOn ? D(p.expiresOn) : t("noExpiry")}</dd></div>
                  <div><dt className="text-xs text-muted">{t("evidence")}</dt><dd>{p.documentTitle ? `${p.documentId}: ${p.documentTitle}` : t("noDocument")}</dd></div>
                  <div><dt className="text-xs text-muted">{t("recorded")}</dt><dd>{t("byOn", { who: ar ? p.recorderNameAr : p.recorderName, date: dateFmt(p.recordedAt.toISOString(), locale) })}</dd></div>
                </dl>
              )}
              {p?.note && <p className="mt-2">{p.note}</p>}
              {p?.reviewNote && <p className="mt-2 text-danger">{t("reviewNote", { note: p.reviewNote })}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {edit && <RecordPermit assetId={data.asset.id} kind={kind} what={what} renew={!!p} today={DEMO_TODAY} documents={data.documents.map((d) => ({ id: d.id, title: d.title }))} current={p ? { kind, status: p.status, form: p.form, authority: p.authority, reference: p.reference, appliedOn: p.appliedOn, issuedOn: p.issuedOn, expiresOn: p.expiresOn, documentId: p.documentId } : null} />}
                {verify && p && p.verification !== "verified" && p.recordedBy !== me && <PermitReview id={p.id} what={what} />}
              </div>
            </li>
          );
        })}
      </ul>
      {data.history.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-4 text-sm">
          <summary className="min-h-10 cursor-pointer font-semibold">{t("history", { n: data.history.length })}</summary>
          <ul className="mt-2 divide-y divide-line">
            {data.history.map((h) => (
              <li key={h.id} className="py-2">{t(`k_${h.kind}`)}: {t(`st_${h.status}`)}{h.expiresOn ? `, ${t("untilDate", { date: D(h.expiresOn) })}` : ""}<span className="block text-xs text-muted">{t("replacedOn", { id: h.id, date: dateFmt(h.supersededAt!.toISOString(), locale) })}</span></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
