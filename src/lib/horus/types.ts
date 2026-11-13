export type CiteKind = "asset" | "lease" | "valuation" | "market" | "doc" | "update" | "sale" | "calc" | "file" | "help" | "alert" | "work";
export const CITE_RE = /^(asset|lease|valuation|market|doc|update|sale|calc|file|help|alert|work):[A-Za-z0-9_.:-]+$/;

export type HorusMode = "portfolio" | "help";

/**
 * Something Horus prepared that only a person can carry out. The server checks the signed-in role again on confirm,
 * through the same service the page uses, and every confirmed action is written to the audit chain.
 */
export type HorusAction =
  | { kind: "snooze_alert"; alertKey: string; label: string; reason: string }
  | { kind: "start_valuation"; assetId: string; label: string }
  | { kind: "draft_email"; to: string; subject: string; body: string };

export interface Block { text: string; cites: string[] }
export interface Draft { title: string; body: string; cites: string[] }
export type Notice = "no_key" | "rate_limit" | "error" | null;

export interface HorusAnswer {
  question: string;
  mode: "live" | "scripted";
  notice: Notice;
  blocks: Block[];
  cannotVerify: boolean;
  /** Blocks removed because they had no valid citation or contained a number no tool returned. */
  dropped: number;
  draft: Draft | null;
  /** True when the question asked for advice or a prediction. Horus declines and points to the data instead. */
  advice: boolean;
  /** Actions Horus prepared for the user to confirm. */
  actions?: HorusAction[];
  /** Help mode: links to the help articles the answer came from. */
  help?: { id: string; title: string; href: string | null }[];
}

/** One step of progress while an answer is being prepared, streamed to the panel. */
export interface HorusStep { tool: string }

export interface ToolOut { data: unknown; cites: string[] }
export interface HorusCtx { user: { id: string; name: string; role: "investor" | "manager" | "admin" }; locale: string; currency: "EGP" | "USD"; fx: number; fileIds?: string[] }
