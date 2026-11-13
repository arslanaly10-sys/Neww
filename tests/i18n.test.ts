import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import { PERMISSIONS } from "../src/lib/permissions";

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = ""): Record<string, string> =>
  Object.entries(o).reduce((acc, [k, v]) => (typeof v === "string" ? { ...acc, [`${p}${k}`]: v } : { ...acc, ...flat(v, `${p}${k}.`) }), {} as Record<string, string>);
const E = flat(en as Tree), A = flat(ar as Tree);
/** Top-level ICU arguments only: "{name}" and "{name, select, …}" count; the text inside a select's branches does not. */
const placeholders = (s: string) => {
  const out: string[] = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") {
      if (depth === 0) { const m = /^\{(\w+)/.exec(s.slice(i)); if (m) out.push(m[1]); }
      depth++;
    } else if (s[i] === "}") depth = Math.max(0, depth - 1);
  }
  return out.sort();
};

describe("message catalogs", () => {
  it("have exactly the same keys in English and Arabic", () => {
    expect(Object.keys(A).filter((k) => !(k in E))).toEqual([]);
    expect(Object.keys(E).filter((k) => !(k in A))).toEqual([]);
  });
  it("never use a dot inside a key (next-intl reads dots as nesting)", () => {
    const bad: string[] = [];
    const walk = (o: Tree, p = "") => Object.entries(o).forEach(([k, v]) => { if (k.includes(".")) bad.push(p + k); if (typeof v !== "string") walk(v, `${p}${k}/`); });
    walk(en as Tree); walk(ar as Tree);
    expect(bad).toEqual([]);
  });
  it("use the same placeholders in both languages", () => {
    for (const k of Object.keys(E)) expect(placeholders(A[k]), k).toEqual(placeholders(E[k]));
  });
  it("have no empty strings", () => {
    for (const [k, v] of [...Object.entries(E), ...Object.entries(A)]) if (!k.endsWith("horusSoon")) expect(v.trim().length, k).toBeGreaterThan(0);
  });
  it("write Arabic with Western digits only", () => {
    for (const [k, v] of Object.entries(A)) expect(/[٠-٩]/.test(v), k).toBe(false);
  });
  it("label every permission in both languages", () => {
    for (const p of Object.keys(PERMISSIONS)) {
      const key = `governance.perm.${p.replace(/\./g, "_")}`;
      expect(E[key], key).toBeTruthy();
      expect(A[key], key).toBeTruthy();
    }
  });
  it("write the Arabic copy in Arabic", () => {
    const latinOnly = Object.entries(A).filter(([k, v]) => { const text = v.replace(/\{[^}]*\}/g, "").trim(); return !/[\u0600-\u06FF]/.test(v) && !/^(brand\.name|horus\.sep|cite\.k_)/.test(k) && text.length > 12; });
    expect(latinOnly.map(([k]) => k)).toEqual([]);
  });
});
