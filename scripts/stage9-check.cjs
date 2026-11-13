const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-9";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(fin|nav|horus|gov2|governance|decide|al)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], manager2: ["Omar Saleh", "عمر صالح"], investor: ["Karim Fahmy", "كريم فهمي"] };

/** Stage 9: cash flow and finance — overview and forecast, ledger, budget against actual, distributions. */
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
  const signIn = async (p, loc, who) => {
    await p.goto(`${BASE}/${loc}`);
    await p.getByRole("button", { name: loc === "en" ? `Enter as ${NAMES[who][0]}` : `الدخول بصفة ${NAMES[who][1]}` }).click();
    await p.waitForURL(`**/${loc}/overview`);
  };
  const settle = async (p, ms = 1200) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => v.id).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };

  // ================= Manager 1 =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Finance" }).click();
  await p.waitForURL("**/en/finance"); await settle(p);
  log((await p.title()) === "Cash flow and finance · ZMNHOOF OS", "Finance page has its own title");
  const ov = await p.locator("main").innerText();
  log(/Net operating income/.test(ov) && /Forecast, next 12 months/.test(ov), "overview shows NOI and the forecast");
  log((await p.locator("table").first().locator("tbody tr").count()) === 12, "forecast lists twelve months");
  await axe(p, "finance overview");
  await p.screenshot({ path: `${OUT}/en-overview.png`, fullPage: true });

  // Ledger: filter and add a line
  await p.getByRole("tab", { name: "Ledger" }).click();
  await p.getByRole("list", { name: "Show one category" }).getByRole("link", { name: "Maintenance", exact: true }).click();
  await p.waitForURL("**/finance?cat=maintenance#ledger"); await settle(p);
  const kinds = await p.getByRole("list", { name: "Ledger" }).locator("li span.font-semibold").allInnerTexts();
  log(kinds.length > 0 && kinds.every((k) => k === "Maintenance"), `the Maintenance filter shows only maintenance lines (${kinds.length})`);
  await p.getByRole("button", { name: "Add a ledger line" }).click();
  const sheet = p.getByRole("dialog", { name: "Add a ledger line" });
  await sheet.getByLabel("Category").selectOption("insurance");
  await sheet.getByLabel("Amount (EGP)").fill("18500");
  await sheet.getByLabel("Description").fill("Glass breakage cover, Zamalek");
  await sheet.getByRole("button", { name: "Save" }).click();
  await p.getByText(/Added LE-[0-9a-f]+\. Recorded as audit event #\d+\./).waitFor();
  await p.goto(`${BASE}/en/finance?cat=insurance#ledger`); await settle(p);
  log(await p.getByText("Glass breakage cover, Zamalek").isVisible() && await p.getByText("−EGP 18,500").first().isVisible(), "the new line appears as a cost");

  // Budget against actual
  await p.getByRole("tab", { name: /Budget vs actual/ }).click();
  const bud = await p.getByRole("tabpanel", { name: /Budget vs actual/ }).innerText();
  log(/Maintenance[^\n]*\n?[^\n]*Short by/.test(bud) || /Maintenance[\s\S]{0,80}Short by/.test(bud), "maintenance is shown over budget");
  const align = await p.getByRole("tabpanel", { name: /Budget vs actual/ }).locator("table").evaluate((tb) => {
    const th = tb.querySelectorAll("thead th")[2].getBoundingClientRect();
    const td = tb.querySelector("tbody tr").querySelectorAll("td")[1].getBoundingClientRect();
    return Math.abs(th.right - td.right);
  });
  log(align < 4, `budget table figures sit under their column heading (${Math.round(align)}px)`);
  await axe(p, "budget against actual");
  await p.screenshot({ path: `${OUT}/en-budget.png` });

  // Propose the Q3 distribution
  await p.getByRole("tab", { name: "Distributions" }).click();
  await p.getByRole("button", { name: "Propose 2026-Q3 distribution" }).click();
  const dlg = p.getByRole("dialog", { name: "Distribution for 2026-Q3" });
  const amount = Number(await dlg.getByLabel("Amount (EGP)").inputValue());
  log(amount > 0, `suggested amount is pre-filled (${amount})`);
  await dlg.getByRole("button", { name: "Send for approval" }).click();
  const proposed = await p.getByText(/DS-\d{3} sent for approval as AP-[0-9A-F]+\. Audit event #\d+\./).innerText();
  const dsId = proposed.match(/DS-\d{3}/)[0], apId = proposed.match(/AP-[0-9A-F]+/)[0];
  log(true, `proposed ${dsId} (${apId})`);
  await p.goto(`${BASE}/en/overview/alerts`); await settle(p);
  const own = p.locator("li", { hasText: apId }).first();
  log(await own.getByRole("button", { name: "Approve" }).isDisabled(), "the proposer cannot approve their own distribution");
  await c.close();

  // ================= Manager 2 approves =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager2");
  await p.goto(`${BASE}/en/overview/alerts`); await settle(p);
  const item = p.locator("li", { hasText: apId }).first();
  log(await item.getByText(/for 2026-Q3: EGP/).isVisible(), "the approvals queue describes the distribution");
  await item.getByRole("button", { name: "Approve" }).click();
  const sheet2 = p.getByRole("dialog", { name: new RegExp(`Approve ${dsId}`) });
  log(await sheet2.getByText("Share paid out").isVisible(), "the decision sheet shows the payout share");
  await sheet2.getByRole("button", { name: "Approve" }).click();
  await p.getByText(new RegExp(`${apId} is approved`)).waitFor();
  await c.close();

  // ================= Manager 1 pays =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager1");
  await p.goto(`${BASE}/en/finance#distributions`); await settle(p);
  await p.locator("li", { hasText: dsId }).getByRole("button", { name: "Mark as paid" }).click();
  await p.getByText(/Marked paid; the investor was notified through the outbox\. Audit event #\d+\./).waitFor();
  await p.reload(); await settle(p);
  log(await p.locator("li", { hasText: dsId }).getByText("Paid", { exact: true }).isVisible(), `${dsId} is paid`);
  await axe(p, "distributions");
  await leak(p, "finance distributions");
  await p.screenshot({ path: `${OUT}/en-distributions.png`, fullPage: true });

  // Horus
  await p.getByRole("button", { name: "Ask Horus" }).first().click();
  const h = p.getByRole("dialog", { name: /Horus/ });
  await h.locator("#horus-q").fill("How are we doing against budget?"); await h.locator("#horus-q").press("Enter");
  await h.getByText(/net operating income was/).waitFor({ timeout: 15000 });
  log(await h.getByText(/largest shortfall is/).isVisible(), "Horus answers with NOI and the largest budget shortfall");
  await c.close();

  // ================= Investor =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/finance`); await settle(p);
  const it = await p.locator("main").innerText();
  log(await p.getByRole("tab").count() === 0 && /Distributions/.test(it), "investor sees distributions only");
  log(!/Net operating income|Ledger|Budget/.test(it) && (it.match(/Paid/g) ?? []).length >= 3, "investor sees no ledger or budget, and three paid distributions");
  await c.close();

  // ================= Phone, Arabic =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "manager1");
  await p.goto(`${BASE}/ar/finance`); await settle(p);
  await noH(p, "ar finance @390");
  await leak(p, "ar finance");
  await p.getByRole("tab", { name: "الموازنة مقابل الفعلي" }).click(); await p.waitForTimeout(300);
  await noH(p, "ar budget @390");
  await p.screenshot({ path: `${OUT}/ar-finance-phone.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
