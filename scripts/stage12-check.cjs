const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-12";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(ntf|nav)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], manager2: ["Omar Saleh", "عمر صالح"], investor: ["Karim Fahmy", "كريم فهمي"] };

/** Stage 12: notifications — the inbox menu, the page, preferences, and events reaching the right person. */
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

  // ================= Manager 1: the inbox menu =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await settle(p);
  const inbox = p.getByRole("button", { name: "Notifications, 3 unread" });
  log(await inbox.isVisible(), "the inbox shows three unread");
  await inbox.click();
  const menu = p.getByRole("dialog", { name: "Notifications" });
  await menu.getByText("Valuation V-0016 is waiting for your approval").waitFor();
  log(true, "the menu lists the latest notifications in words");
  await axe(p, "inbox menu open");
  await p.screenshot({ path: `${OUT}/en-inbox-menu.png` });
  await menu.getByRole("link", { name: /Valuation V-0016 is waiting/ }).click();
  await p.waitForURL("**/en/valuation#queue"); await settle(p);
  log(await p.getByRole("button", { name: "Notifications, 2 unread" }).isVisible(), "following a notification marks it read");
  await p.getByRole("button", { name: "Notifications, 2 unread" }).click();
  await p.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Mark all as read" }).click();
  await p.getByRole("button", { name: "Notifications", exact: true }).waitFor();
  log(true, "mark all as read clears the count");
  await p.keyboard.press("Escape");

  // Assign work to Omar: he is told.
  await p.goto(`${BASE}/en/maintenance/WO-012`); await settle(p);
  await p.getByLabel("Assigned to").selectOption({ label: "Omar Saleh" });
  await p.getByRole("button", { name: "Save changes" }).click();
  await p.getByText(/Saved 1 changes/).waitFor();
  await c.close();

  // ================= Manager 2: receives it =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager2");
  await settle(p);
  await p.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  await p.getByRole("dialog", { name: "Notifications" }).getByText("WO-012 is assigned to you: Annual boiler service").waitFor();
  log(true, "the assignee hears about the assignment");
  await p.keyboard.press("Escape");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Notifications" }).click();
  await p.waitForURL("**/en/notifications"); await settle(p);
  log((await p.title()) === "Notifications · ZMNHOOF OS", "Notifications page has its own title");
  await p.getByRole("link", { name: "Maintenance and tasks", exact: true }).click(); await p.waitForURL("**/notifications?c=work"); await settle(p);
  const listed = await p.getByRole("list", { name: "Notifications" }).locator("li").allInnerTexts();
  log(listed.length >= 2 && listed.every((x) => x.includes("Maintenance and tasks")), `the category filter works (${listed.length})`);
  await p.getByRole("tab", { name: "Settings" }).click();
  await p.getByLabel("Maintenance and tasks by email").check();
  await p.getByRole("button", { name: "Save settings" }).click();
  await p.getByText("Settings saved.").waitFor();
  await p.reload(); await settle(p);
  await p.getByRole("tab", { name: "Settings" }).click();
  log(await p.getByLabel("Maintenance and tasks by email").isChecked(), "preferences are saved");
  await axe(p, "notification settings");
  await leak(p, "notifications page");
  await p.screenshot({ path: `${OUT}/en-settings.png`, fullPage: true });
  await c.close();

  // ================= Phone, Arabic =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "investor");
  const bar = await p.locator("div.sticky.top-0").first().boundingBox();
  log(bar.height < 70, `phone toolbar stays one row with the inbox (${Math.round(bar.height)}px)`);
  await noH(p, "ar overview @390");
  await p.getByRole("button", { name: /^الإشعارات/ }).click();
  await p.getByRole("dialog", { name: "الإشعارات" }).getByText(/دُفع التوزيع DS-002/).waitFor();
  log(true, "Arabic notifications read naturally");
  await p.screenshot({ path: `${OUT}/ar-inbox-phone.png` });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
