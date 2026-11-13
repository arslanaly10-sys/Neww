const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-14";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(deals|nav|ntf|cal)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], manager2: ["Omar Saleh", "عمر صالح"], investor: ["Karim Fahmy", "كريم فهمي"] };

/** Stage 14: the deals pipeline — board, drag and drop, the funnel, a deal's page, sharing with investors. */
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
  const settle = async (p, ms = 1500) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => `${v.id}:${v.nodes.length}`).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.replace(/\S+@\S+/g, "").match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };
  const col = (p, name) => p.getByRole("list", { name, exact: true });

  // ================= Manager 1, desktop =================
  let { c, p } = await open({ width: 1440, height: 900 });
  await signIn(p, "en", "manager1");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Deals" }).click();
  await p.waitForURL("**/en/deals"); await settle(p);
  log((await p.title()) === "Deals · ZMNHOOF OS", "Deals page has its own title");
  log(await col(p, "Negotiation").getByRole("listitem").count() === 2, "the board shows deals by stage");
  await axe(p, "deals board");
  await leak(p, "deals board");
  await p.screenshot({ path: `${OUT}/en-board.png`, fullPage: true });

  // Drag D-001 from Sourcing to Screening.
  const card = p.locator('[data-card="D-001"]');
  const target = p.locator('section[data-stage="screening"]');
  await p.locator('section[data-stage="sourcing"]').evaluate((e) => e.scrollIntoView({ block: "start" }));
  await p.waitForTimeout(400);
  const a = await card.boundingBox(), b = await target.boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + 12);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a.x + a.width / 2 + ((b.x + b.width / 2) - (a.x + a.width / 2)) * i / 12, a.y + 12 + ((b.y + Math.min(b.height - 30, 300)) - (a.y + 12)) * i / 12);
  await p.mouse.up();
  await p.waitForTimeout(1500);
  log(await col(p, "Screening").locator('[data-card="D-001"]').count() === 1, "dragging a card moves the deal to another stage");
  await p.reload(); await settle(p);
  log(await col(p, "Screening").locator('[data-card="D-001"]').count() === 1, "the move is saved");

  // Keyboard: the stage menu. Losing asks for a reason.
  await p.getByLabel("Stage of D-002").selectOption({ label: "Move to Lost" });
  const dlg = p.getByRole("dialog", { name: "Why was it lost?" });
  await dlg.getByLabel("Reason").fill("Owner sold to another buyer.");
  await axe(p, "lost reason dialog");
  await dlg.getByRole("button", { name: "Mark as lost" }).click();
  await p.waitForTimeout(1500);
  log(await col(p, "Lost").locator('[data-card="D-002"]').count() === 1, "the stage menu moves a deal, asking why when it is lost");

  // The funnel brings a column into view.
  await p.getByRole("button", { name: /^Due diligence/ }).click();
  log(await p.locator('section[data-stage="due_diligence"]').evaluate((e) => e.className.includes("border-gold-fill")), "choosing a funnel stage highlights its column");

  // New deal.
  await p.getByRole("button", { name: "New deal" }).click();
  const sheet = p.getByRole("dialog", { name: "New deal" });
  await sheet.getByRole("textbox", { name: "Title", exact: true }).fill("Penthouse, Zamalek");
  await sheet.getByLabel("District").selectOption({ label: "Zamalek" });
  await sheet.getByLabel("Area (m²)").fill("280");
  await sheet.getByLabel("Asking price (EGP)").fill("42000000");
  await sheet.getByLabel("Owner").selectOption({ label: "Omar Saleh" });
  await axe(p, "new deal sheet");
  await sheet.getByRole("button", { name: "Add to the pipeline" }).click();
  await p.waitForURL(/\/en\/deals\/D-\d{3}\?created=1/); await settle(p);
  const id = p.url().match(/D-\d{3}/)[0];
  log(await p.getByText(`${id} is in the pipeline.`).isVisible(), `a new deal opens its page (${id})`);
  log(await p.getByRole("heading", { name: "Against the market" }).isVisible() && /above the market|below the market|In line with the market/.test(await p.locator("main").innerText()), "the deal is checked against comparable sales");
  await p.getByRole("list", { name: "Stages" }).getByRole("button", { name: "Offer made" }).click();
  await p.waitForTimeout(1200);
  log(await p.getByText(/moved it to Offer made/).isVisible(), "the stepper moves the deal and the timeline records it");
  await p.getByLabel("Add a note for the team").fill("Building has a new lift; ask for the maintenance contract.");
  await p.getByRole("button", { name: "Save note" }).click();
  await p.getByText("Building has a new lift; ask for the maintenance contract.").waitFor();
  log(true, "notes go on the timeline");
  await axe(p, "deal page");
  await leak(p, "deal page");
  await p.screenshot({ path: `${OUT}/en-deal.png`, fullPage: true });

  await p.goto(`${BASE}/en/deals?view=list`); await settle(p);
  log(await p.getByRole("table", { name: "Deals" }).isVisible(), "the list view shows every deal in a table");
  await c.close();

  // ================= Manager 2: told =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager2"); await settle(p);
  await p.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  await p.getByRole("dialog", { name: "Notifications" }).getByText(`Deal ${id} is yours: Penthouse, Zamalek`).waitFor();
  log(true, "the owner hears that the deal is theirs");
  await c.close();

  // ================= Investor, Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "investor");
  await p.goto(`${BASE}/ar/deals`); await settle(p);
  const text = await p.locator("main").innerText();
  log(text.includes("شقة على النيل، الزمالك") && !text.includes("شقة ناصية، التجمع الخامس"), "investors see shared deals only");
  log(await p.getByRole("button", { name: "صفقة جديدة" }).count() === 0 && await p.locator("select").count() === 0, "investors cannot add or move deals");
  await noH(p, "ar deals @390");
  await axe(p, "ar deals phone");
  await leak(p, "ar deals phone");
  await p.screenshot({ path: `${OUT}/ar-board-phone.png`, fullPage: true });
  await p.goto(`${BASE}/ar/deals/D-007`); await settle(p);
  log(!(await p.locator("main").innerText()).includes("Private seller"), "investors never see the counterparty");
  await c.close();

  // ================= Dark desktop, Arabic =================
  ({ c, p } = await open({ width: 1440, height: 900 }, "dark"));
  await signIn(p, "ar", "manager1");
  await p.goto(`${BASE}/ar/deals`); await settle(p);
  await axe(p, "ar deals dark");
  await p.screenshot({ path: `${OUT}/ar-board-dark.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
