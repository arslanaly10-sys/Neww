export type CiteKind = "asset" | "lease" | "valuation" | "market" | "doc" | "update" | "sale" | "calc";
export const CITE_RE = /^(asset|lease|valuation|market|doc|update|sale|calc):[A-Za-z0-9_.-]+$/;

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
}

export interface ToolOut { data: unknown; cites: string[] }
export interface HorusCtx { user: { id: string; name: string; role: "investor" | "manager" | "admin" }; locale: string; currency: "EGP" | "USD"; fx: number }
