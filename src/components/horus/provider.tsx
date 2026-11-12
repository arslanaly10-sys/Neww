"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface Ctx { open: boolean; setOpen: (o: boolean) => void; ask: (q: string) => void; pending: string | null; consume: () => void }
const HorusCtx = createContext<Ctx | null>(null);

/** Lets the command bar and any button open the Horus panel, optionally with a question to send. */
export function HorusProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const ask = useCallback((q: string) => { setPending(q); setOpen(true); }, []);
  const consume = useCallback(() => setPending(null), []);
  const v = useMemo(() => ({ open, setOpen, ask, pending, consume }), [open, ask, pending, consume]);
  return <HorusCtx.Provider value={v}>{children}</HorusCtx.Provider>;
}
export function useHorus() {
  const c = useContext(HorusCtx);
  if (!c) throw new Error("useHorus outside HorusProvider");
  return c;
}
