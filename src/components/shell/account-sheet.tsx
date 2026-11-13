"use client";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Settings2, X } from "lucide-react";

/**
 * Phones: the role, currency and language controls live in one sheet behind a single toolbar button, so the toolbar
 * stays one row. Desktop shows the same controls inline and never renders this.
 */
export function AccountSheet({ children, label }: { children: React.ReactNode; label: string }) {
  const t = useTranslations("shell");
  return (
    <Dialog.Root>
      <Dialog.Trigger className="grid size-11 place-items-center rounded-md border border-line hover:bg-surface-2 active:bg-line/60 md:hidden" aria-label={label}>
        <Settings2 aria-hidden="true" size={17} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-display text-xl">{label}</Dialog.Title>
            <Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={18} /></Dialog.Close>
          </div>
          <div className="flex flex-col gap-4 [&_[role=group]]:self-start">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
