"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { BarChart3, Bell, Wrench, Building2, Calculator, FileText, Handshake, LifeBuoy, LineChart, Megaphone, Paperclip, ReceiptText, X } from "lucide-react";
import { getCitationAction } from "@/app/horus-actions";
import { Link } from "@/i18n/navigation";
import { Badge } from "../ui";

const ICON = { asset: Building2, lease: Handshake, valuation: ReceiptText, market: LineChart, doc: FileText, update: Megaphone, sale: BarChart3, calc: Calculator, file: Paperclip, help: LifeBuoy, alert: Bell, work: Wrench } as const;
type Kind = keyof typeof ICON;
interface Detail { id: string; kind: string; title: string; rows: { label: string; value: string }[]; href: string | null; sample?: boolean }

/** A citation chip: icon plus short code. Opens the exact row the claim came from, fetched under the viewer's own permissions. */
export function CitationChip({ id }: { id: string }) {
  const t = useTranslations("cite");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null | undefined>(undefined);
  const [pending, start] = useTransition();
  const kind = id.slice(0, id.indexOf(":")) as Kind;
  const key = id.slice(id.indexOf(":") + 1);
  const Icon = ICON[kind] ?? FileText;
  const calcName = kind === "calc" ? (key.startsWith("risk_") ? `${t("c_risk")} ${key.slice(5)}` : (t.has(`c_${key}`) ? t(`c_${key}` as "c_risk") : key.replace(/_/g, " "))) : null;
  const short = calcName ?? (kind === "alert" ? key.split(":").pop()! : key);

  const load = () => start(async () => { setDetail(await getCitationAction(id, locale)); });
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (o && detail === undefined) load(); }}>
      <Dialog.Trigger className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs font-semibold text-gold hover:border-gold focus-visible:outline-offset-2" aria-label={`${t(`k_${kind}` as "k_asset")} ${short}`}>
        <Icon aria-hidden="true" size={12} />
        <span><span className="text-muted">{t(`k_${kind}` as "k_asset")} </span><bdi className="num">{short}</bdi></span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content className="fixed start-1/2 top-[12vh] z-[61] max-h-[76vh] w-[min(30rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md rtl:translate-x-1/2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-xl">{detail?.title ?? `${t(`k_${kind}` as "k_asset")} ${short}`}</Dialog.Title>
              <Dialog.Description className="sr-only">{t("sampleNote")}</Dialog.Description>
              {detail?.sample !== false && <Badge tone="gold" className="mt-1">{t("sampleNote")}</Badge>}
            </div>
            <Dialog.Close className="grid size-9 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close>
          </div>
          {pending && detail === undefined ? <p className="mt-4 text-sm text-muted" role="status">{t("loading")}</p>
            : detail === null ? <p className="mt-4 text-sm text-muted">{t("missing")}</p>
            : detail && (
              <>
                <dl className="mt-4 divide-y divide-line text-sm">
                  {detail.rows.map((r) => (<div key={r.label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2"><dt className="text-muted">{r.label}</dt><dd className="max-w-[18rem] text-end"><bdi>{r.value}</bdi></dd></div>))}
                </dl>
                {detail.href && <Link href={detail.href} onClick={() => setOpen(false)} className="mt-4 inline-block text-sm text-gold underline underline-offset-4">{t("open")}</Link>}
              </>
            )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
