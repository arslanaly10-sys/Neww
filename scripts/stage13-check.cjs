const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-13";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(cal|nav|ntf)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], manager2: ["Omar Saleh", "عمر صالح"], investor: ["Karim Fahmy", "كريم فهمي"] };

/** Stage 13: the calendar — month and agenda views, filters, adding, changing and cancelling events, invitations, .ics. */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  const open = async (viewport, scheme = "light") => {
    const c = await browser.newContext({ viewport, colorScheme: scheme, acceptDownloads: true });
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
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => `${v.id}:${v.nodes.length}`).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.replace(/\S+@\S+/g, "").match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };

  // ================= Manager 1, desktop =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Calendar" }).click();
  await p.waitForURL("**/en/calendar"); await settle(p);
  log((await p.title()) === "Calendar · ZMNHOOF OS", "Calendar page has its own title");
  const grid = p.getByRole("table", { name: /November 2026/ });
  log(await grid.isVisible(), "the month grid shows November 2026");
  const today = grid.locator('td[aria-current="date"]');
  log((await today.innerText()).includes("Weekly portfolio review"), "today's cell holds the weekly review");
  log((await grid.innerText()).includes("rent invoice"), "rent due dates appear for managers");
  await axe(p, "calendar month");
  await leak(p, "calendar month");
  await p.screenshot({ path: `${OUT}/en-month.png`, fullPage: true });

  await p.getByRole("list", { name: "Show" }).getByRole("link", { name: /^Rent due/ }).click();
  await p.waitForURL("**/calendar?s=rent"); await settle(p);
  const shown = await p.getByRole("table", { name: /November 2026/ }).locator("td a").allInnerTexts();
  log(shown.length > 0 && shown.every((x) => /rent invoice|more/i.test(x)), `the filter narrows to rent (${shown.length})`);
  await p.getByRole("list", { name: "Show" }).getByRole("link", { name: /^All/ }).click(); await p.waitForURL(/\/en\/calendar$/); await settle(p);

  await p.getByRole("link", { name: "Next month" }).click(); await p.waitForURL("**/calendar?m=2026-12"); await settle(p);
  log((await p.getByRole("table", { name: /December 2026/ }).innerText()).includes("Annual investor meeting"), "next month shows December");
  await p.getByRole("link", { name: "Agenda" }).click(); await p.waitForURL("**/calendar?m=2026-12&view=agenda"); await settle(p);
  log(await p.getByRole("list", { name: /December 2026, day by day/ }).isVisible(), "the agenda lists the month day by day");
  await p.getByRole("link", { name: "Today", exact: true }).click(); await p.waitForURL("**/calendar?view=agenda"); await settle(p);

  // Add an event that clashes with the weekly review on the 19th.
  await p.getByRole("button", { name: "New event" }).click();
  const sheet = p.getByRole("dialog", { name: "New event" });
  await sheet.getByRole("textbox", { name: "Title", exact: true }).fill("Contractor walk-through");
  await sheet.getByLabel("Date").fill("2026-11-19");
  await sheet.getByLabel("Starts").fill("10:30");
  await sheet.getByLabel("Ends").fill("11:30");
  await sheet.getByLabel("Asset").selectOption("A-008");
  await sheet.getByLabel("Omar Saleh").check();
  await axe(p, "new event sheet");
  await p.screenshot({ path: `${OUT}/en-new-event.png` });
  await sheet.getByRole("button", { name: "Add to calendar" }).click();
  await p.waitForURL(/\/en\/calendar\/CE-\d{3}\?created=1/); await settle(p);
  const evUrl = p.url();
  const evId = evUrl.match(/CE-\d{3}/)[0];
  log(await p.getByText(`${evId} is in the calendar`).isVisible(), `the event is created (${evId})`);
  log(await p.getByText(/overlaps with: Weekly portfolio review \(10:00\)/).isVisible(), "a clash with the weekly review is flagged");
  await axe(p, "event page");
  await leak(p, "event page");
  await p.screenshot({ path: `${OUT}/en-event.png`, fullPage: true });

  // Move it; Omar is told.
  await p.getByRole("button", { name: "Edit" }).click();
  const ed = p.getByRole("dialog", { name: "Edit event" });
  await ed.getByLabel("Date").fill("2026-11-24");
  await ed.getByRole("button", { name: "Save changes" }).click();
  await p.getByText(/Saved \d changes/).waitFor();
  log(true, "editing the date saves");

  // The .ics file.
  const res = await p.request.get(`${BASE}/api/calendar?lang=en`);
  const ics = await res.text();
  log(res.status() === 200 && ics.startsWith("BEGIN:VCALENDAR") && ics.includes(`UID:${evId}@zmnhoof.example`), "the .ics download holds the calendar, the new event included");
  await c.close();

  // ================= Manager 2: invited, then told it moved =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager2");
  await settle(p);
  await p.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  const menu = p.getByRole("dialog", { name: "Notifications" });
  await menu.getByText("You are invited: Contractor walk-through").waitFor();
  await menu.getByText("Moved: Contractor walk-through").waitFor();
  log(true, "the invited manager hears about the invitation and the move");
  await p.keyboard.press("Escape");
  await p.goto(`${BASE}/en/calendar/${evId}`); await settle(p);
  await p.getByRole("button", { name: "Cancel event" }).click();
  await p.getByRole("button", { name: "Yes, cancel it" }).click();
  await p.waitForURL(`**/calendar?m=2026-11&deleted=${evId}`); await settle(p);
  log(await p.getByText(`${evId} was cancelled`).isVisible(), "cancelling removes the event");
  await c.close();

  // ================= Investor, Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "investor");
  await p.goto(`${BASE}/ar/calendar`); await settle(p);
  const agenda = p.getByRole("list", { name: /نوفمبر 2026، يومًا بيوم/ });
  log(await agenda.isVisible(), "phones get the agenda list");
  const text = await agenda.innerText();
  log(text.includes("المكالمة الربع سنوية مع المستثمر") && !text.includes("المراجعة الأسبوعية"), "the investor sees the shared call, not the team review");
  log(!/إيجار مستحق|تقرير مجدول/.test(await p.locator("main").innerText()), "no rent or report schedules for the investor");
  log(await p.getByRole("button", { name: "حدث جديد" }).count() === 0, "investors cannot add events");
  await noH(p, "ar calendar @390");
  await axe(p, "ar calendar phone");
  await leak(p, "ar calendar phone");
  await p.screenshot({ path: `${OUT}/ar-agenda-phone.png`, fullPage: true });
  await c.close();

  // ================= Dark, Arabic desktop =================
  ({ c, p } = await open({ width: 1360, height: 900 }, "dark"));
  await signIn(p, "ar", "manager1");
  await p.goto(`${BASE}/ar/calendar`); await settle(p);
  await axe(p, "ar calendar dark");
  await p.screenshot({ path: `${OUT}/ar-month-dark.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
