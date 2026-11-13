"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { HorusMode } from "@/lib/horus/types";

interface Pending { q: string; mode?: HorusMode }
interface Ctx { open: boolean; setOpen: (o: boolean) => void; ask: (q: string, mode?: HorusMode) => void; openMode: (mode: HorusMode) => void; requestedMode: HorusMode | null; pending: Pending | null; consume: () => void }
const HorusCtx = createContext<Ctx | null>(null);

/** Lets the command bar, the floating bubble and any button open the Horus panel, optionally with a question or a mode. */
export function HorusProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [requestedMode, setRequestedMode] = useState<HorusMode | null>(null);
  const ask = useCallback((q: string, mode?: HorusMode) => { setPending({ q, mode }); setOpen(true); }, []);
  const openMode = useCallback((mode: HorusMode) => { setRequestedMode(mode); setOpen(true); }, []);
  const consume = useCallback(() => { setPending(null); setRequestedMode(null); }, []);
  const v = useMemo(() => ({ open, setOpen, ask, openMode, requestedMode, pending, consume }), [open, ask, openMode, requestedMode, pending, consume]);
  return <HorusCtx.Provider value={v}>{children}</HorusCtx.Provider>;
}
export function useHorus() {
  const c = useContext(HorusCtx);
  if (!c) throw new Error("useHorus outside HorusProvider");
  return c;
}
