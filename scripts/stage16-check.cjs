const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-16";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(record|nav|ntf|roles)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 16: the asset as the central record — identity, ownership, units, sourced facts, versions, analyst review. */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  const open = async (viewport, scheme = "light") => {
    const c = await browser.newContext({ viewport, colorScheme: scheme });
    const p = await c.newPage();
    p.on("console", (m) => { if (m.type() === "error") errors.push(`${p.url()} ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`${p.url()} pageerror ${e.message}`));
    return { c, p };
  };
  const signIn = async (p, loc, name) => { await p.goto(`${BASE}/${loc}`); await p.getByRole("button", { name }).click(); await p.waitForURL(`**/${loc}/overview`); };
  const settle = async (p, ms = 1500) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => `${v.id}:${v.nodes.length}`).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.replace(/\S+@\S+/g, "").match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };

  // ================= Manager: the record, and a change =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "Enter as Nour Abdelrahman");
  await p.goto(`${BASE}/en/asset/A-008`); await settle(p);
  await p.getByRole("link", { name: /Open the asset record/ }).click();
  await p.waitForURL("**/en/asset/A-008/record"); await settle(p);
  log((await p.title()) === "A-008 record · ZMNHOOF OS", "the record has its own title");
  log(await p.getByText("Never changes, even when details do").isVisible(), "the permanent ID is explained");
  log(await p.getByRole("list", { name: "Ownership" }).getByRole("listitem").count() >= 1, "ownership shares are listed");
  await axe(p, "record identity");
  await p.screenshot({ path: `${OUT}/en-record.png`, fullPage: true });
  await p.getByRole("tab", { name: /Buildings and units/ }).click();
  log(await p.getByRole("table", { name: /Units in/ }).locator("tbody tr").count() === 8, "the mixed-use block lists its 8 units");
  await p.getByRole("tab", { name: /Facts and sources/ }).click();
  log((await p.getByRole("list", { name: "Facts and their sources" }).getByRole("listitem").allInnerTexts()).every((x) => /observed/.test(x)), "each fact names its source and date");
  await axe(p, "record facts");

  await p.goto(`${BASE}/en/asset/A-011/record`); await settle(p);
  await p.getByRole("button", { name: "Change details" }).click();
  const d = p.getByRole("dialog", { name: "Change the asset's details" });
  await d.getByLabel("Built-up area (m²)").fill("167");
  await d.getByLabel("Source", { exact: true }).selectOption("survey");
  await d.getByLabel("Why it changed").fill("Remeasured by the surveyor at handover");
  await axe(p, "change details sheet");
  await d.getByRole("button", { name: "Save as a new version" }).click();
  await p.getByText(/Saved as version 2/).waitFor();
  log(true, "a change is saved as a new version");
  await p.getByRole("tab", { name: /History/ }).click();
  log(await p.getByRole("list", { name: "History" }).getByText("Remeasured by the surveyor at handover").waitFor({ timeout: 8000 }).then(async () => (await p.getByRole("list", { name: "History" }).getByRole("listitem").count()) === 2, () => false), "the history shows both versions");
  await p.getByRole("tab", { name: /Payment plan/ }).click();
  log(await p.getByText("Still to pay").isVisible(), "the payment plan shows what is still owed");
  await leak(p, "record");
  await c.close();

  // ================= Analyst: reviews the evidence =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Laila Mansour");
  log(await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Finance" }).count() === 0, "the analyst has no finance area");
  await p.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  await p.getByRole("dialog", { name: "Notifications" }).getByText("A-011: 1 fact to review").waitFor();
  log(true, "the analyst is told a fact is waiting");
  await p.keyboard.press("Escape");
  await p.goto(`${BASE}/en/asset/facts`); await settle(p);
  log((await p.title()) === "Facts to verify · ZMNHOOF OS", "the review queue has its own title");
  const row = p.getByRole("list", { name: "Facts to verify" }).getByRole("listitem").filter({ hasText: "A-011" }).filter({ hasText: "Built-up area" });
  await row.getByRole("button", { name: /^Verify/ }).click();
  await p.waitForTimeout(1200);
  log(await p.getByRole("list", { name: "Facts to verify" }).getByRole("listitem").filter({ hasText: "A-011" }).filter({ hasText: "Built-up area" }).count() === 0, "verifying takes the fact off the queue");
  await axe(p, "review queue");
  await leak(p, "review queue");
  await p.screenshot({ path: `${OUT}/en-queue.png`, fullPage: true });
  await p.goto(`${BASE}/en/asset/A-011/record#facts`); await settle(p);
  log(await p.getByText(/verified by Laila Mansour/).first().isVisible(), "the record shows who verified it");
  await c.close();

  // ================= Arabic phone, investor =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "الدخول بصفة كريم فهمي");
  await p.goto(`${BASE}/ar/asset/A-012/record`); await settle(p);
  await noH(p, "ar record @390");
  log(await p.getByRole("button", { name: "تغيير البيانات" }).count() === 0, "investors read the record but cannot change it");
  await axe(p, "ar record phone");
  await leak(p, "ar record phone");
  await p.screenshot({ path: `${OUT}/ar-record-phone.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
