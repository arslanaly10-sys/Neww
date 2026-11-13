const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-10";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(work|nav|horus|gov2|governance|cite)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], investor: ["Karim Fahmy", "كريم فهمي"] };

/** Stage 10: maintenance and tasks — the board, work orders, the timeline, costs into the ledger, roles. */
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
  const column = (p, name) => p.locator("section", { has: p.getByRole("heading", { level: 2, name: new RegExp(`^${name}`) }) });

  // ================= Manager =================
  let { c, p } = await open({ width: 1440, height: 900 });
  await signIn(p, "en", "manager1");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Maintenance" }).click();
  await p.waitForURL("**/en/maintenance"); await settle(p);
  log((await p.title()) === "Maintenance and tasks · ZMNHOOF OS", "Maintenance page has its own title");
  log(/Overdue\s+2\b/.test(await p.locator("main").innerText()), "two pieces of work are overdue");
  log(await column(p, "To do").locator("article").first().getByText(/^Overdue, was due/).isVisible(), "overdue work sits at the top of its column");
  await axe(p, "maintenance board");
  await p.screenshot({ path: `${OUT}/en-board.png`, fullPage: true });

  // Start a job from the board
  const todoCount = await column(p, "To do").locator("article").count();
  const card = column(p, "To do").locator("article").filter({ hasText: "WO-012" });
  await card.getByRole("button", { name: "Start" }).click();
  await column(p, "In progress").locator("article").filter({ hasText: "WO-012" }).waitFor();
  log(await column(p, "To do").locator("article").count() === todoCount - 1, "Start moves the card to In progress");

  // Filter to tasks
  await p.getByRole("link", { name: "Tasks", exact: true }).click(); await p.waitForURL("**/maintenance?kind=task"); await settle(p);
  const kinds = await p.locator("main article").count();
  const taskBadges = await p.locator("main article").filter({ hasText: "Task" }).count();
  log(kinds > 0 && kinds === taskBadges, `the Tasks filter shows only tasks (${kinds})`);

  // New task
  await p.getByRole("button", { name: "New work order" }).click();
  const nw = p.getByRole("dialog", { name: "New work order" });
  await nw.getByLabel("Task").check();
  await nw.getByLabel(/What needs doing/).fill("Collect quotes for lobby repainting");
  await nw.getByLabel("Assigned to").selectOption({ label: "Omar Saleh" });
  await nw.getByRole("button", { name: "Create" }).click();
  const created = await p.getByText(/WO-\d{3} created\. Audit event #\d+\./).innerText();
  const newId = created.match(/WO-\d{3}/)[0];
  await p.locator("article", { hasText: newId }).waitFor();
  log(true, `created ${newId}`);

  // Detail: edit, then complete with a cost
  await p.goto(`${BASE}/en/maintenance/WO-005`); await settle(p);
  log(/^WO-005 · ZMNHOOF OS$/.test(await p.title()), "work order tab title is its id");
  await p.getByLabel("Contractor").fill("Delta Doors Express (fictional)");
  await p.getByLabel("Due date").fill("2026-11-15");
  await p.getByRole("button", { name: "Save changes" }).click();
  await p.getByText(/Saved 2 changes\. Audit event #\d+\./).waitFor();
  await p.getByRole("button", { name: "Mark done" }).first().click();
  const done = p.getByRole("dialog", { name: /Finish WO-005/ });
  await done.getByLabel("Actual cost (EGP)").fill("16500");
  await done.getByLabel("Note (optional)").fill("Motor replaced, shutter tested.");
  await done.getByRole("button", { name: "Mark done" }).click();
  await p.getByText(/Done; the cost is in the ledger as LE-[0-9a-f]+\. Audit event #\d+\./).waitFor();
  await p.reload(); await settle(p);
  const tl = await p.getByRole("heading", { name: "Timeline" }).locator("xpath=..").innerText();
  log(/marked it done at a cost of EGP 16,500/.test(tl) && /Motor replaced/.test(tl), "the timeline records the completion and its note");
  await axe(p, "work order page");
  await leak(p, "work order page");
  await p.screenshot({ path: `${OUT}/en-work-order.png`, fullPage: true });
  await p.goto(`${BASE}/en/finance?cat=maintenance#ledger`); await settle(p);
  log(await p.getByText(/WO-005: Shopfront shutter jammed/).isVisible(), "the cost appears in the finance ledger");
  await c.close();

  // ================= Investor =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/asset/A-003`); await settle(p);
  await p.getByRole("button", { name: "Report a problem" }).click();
  const rp = p.getByRole("dialog", { name: "Report a problem" });
  log(await rp.getByLabel("Priority").count() === 0 && await rp.getByLabel("Assigned to").count() === 0, "investors report without priority or assignment");
  await rp.getByLabel(/What needs doing/).fill("Balcony door does not lock");
  await rp.getByLabel("Category").selectOption("structural");
  await rp.getByRole("button", { name: "Send report" }).click();
  const rid = (await p.getByText(/WO-\d{3} created/).innerText()).match(/WO-\d{3}/)[0];
  log(true, `investor reported ${rid} from the asset page`);
  await p.goto(`${BASE}/en/maintenance`); await settle(p);
  const it = await p.locator("main").innerText();
  log(!/EGP/.test(it) && await p.getByRole("button", { name: "Start" }).count() === 0, "investors see no costs and cannot move work");
  await p.goto(`${BASE}/en/maintenance/${rid}`); await settle(p);
  await p.getByLabel("Add a note").fill("Photos sent to the managers by email.");
  await p.getByRole("button", { name: "Post note" }).click();
  await p.getByText("Photos sent to the managers by email.").waitFor();
  log(true, "investors can add a note to the timeline");
  await c.close();

  // ================= Phone, Arabic =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "manager1");
  await p.getByRole("button", { name: "المزيد" }).click();
  await p.getByRole("dialog", { name: "المزيد" }).getByRole("link", { name: "الصيانة" }).click();
  await p.waitForURL("**/ar/maintenance"); await settle(p);
  await noH(p, "ar maintenance @390");
  await leak(p, "ar maintenance");
  await p.screenshot({ path: `${OUT}/ar-board-phone.png`, fullPage: true });
  const h = p.getByRole("button", { name: "اسأل حورس" });
  await h.click();
  const dlg = p.getByRole("dialog", { name: /حورس/ });
  await dlg.locator("#horus-q").fill("ما أعمال الصيانة المتأخرة؟"); await dlg.locator("#horus-q").press("Enter");
  await dlg.getByText(/أعمال مفتوحة/).waitFor({ timeout: 15000 });
  log(await dlg.locator('button[aria-label^="أمر عمل"]').count() > 0, "Horus answers in Arabic with work-order citations");
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
