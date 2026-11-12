import { CITE_RE, type Block, type Draft } from "./types";

/**
 * Grounding checks applied to every answer the model writes.
 *  1. Every block must cite at least one id that a tool actually returned in this conversation.
 *  2. Every number in a block must appear in the tool outputs. The model may not compute or estimate:
 *     a number it invented, rounded differently or derived by arithmetic is rejected.
 * Blocks that fail are dropped, never shown as fact.
 */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const NUM_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

export const normaliseDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, ".").replace(/٬/g, ",");
export function numbersIn(text: string): string[] {
  return (normaliseDigits(text).match(NUM_RE) ?? []).map((n) => n.replace(/,/g, ""));
}

/** The text numbers are checked against: only the values and citation ids a tool returned, never JSON key names. */
export function groundText(out: { data: unknown; cites: string[] }): string {
  const parts: string[] = [...out.cites];
  const walk = (o: unknown) => {
    if (o === null || o === undefined) return;
    if (typeof o === "object") { for (const v of Object.values(o as Record<string, unknown>)) walk(v); return; }
    parts.push(String(o));
  };
  walk(out.data);
  return parts.join("\n");
}

export interface Validated { kept: Block[]; dropped: number; reasons: string[]; draft: Draft | null }

export function validateAnswer(blocks: Block[], draft: Draft | null, allowed: Set<string>, groundText: string): Validated {
  const ground = new Set(numbersIn(groundText));
  const reasons: string[] = [];
  const check = (text: string, cites: string[], label: string) => {
    const valid = cites.filter((c) => CITE_RE.test(c) && allowed.has(c));
    if (valid.length === 0) { reasons.push(`${label}: no valid citation`); return null; }
    const loose = numbersIn(text).filter((n) => !ground.has(n));
    if (loose.length) { reasons.push(`${label}: number not returned by a tool (${loose.slice(0, 3).join(", ")})`); return null; }
    return valid;
  };
  const kept: Block[] = [];
  blocks.forEach((b, i) => {
    if (typeof b?.text !== "string" || !b.text.trim()) return;
    const valid = check(b.text, Array.isArray(b.cites) ? b.cites : [], `block ${i + 1}`);
    if (valid) kept.push({ text: b.text.trim(), cites: [...new Set(valid)] });
  });
  let keptDraft: Draft | null = null;
  if (draft && typeof draft.title === "string" && typeof draft.body === "string") {
    const valid = check(`${draft.title}\n${draft.body}`, Array.isArray(draft.cites) ? draft.cites : [], "draft");
    if (valid) keptDraft = { title: draft.title.trim().slice(0, 200), body: draft.body.trim().slice(0, 4000), cites: [...new Set(valid)] };
  }
  const total = blocks.length + (draft ? 1 : 0);
  return { kept, dropped: total - kept.length - (keptDraft ? 1 : 0), reasons, draft: keptDraft };
}
