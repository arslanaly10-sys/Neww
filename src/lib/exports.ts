import "server-only";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { getPortfolio } from "./access";
import { getLeasing } from "./leasing";
import { getFinance } from "./finance";
import { listWork } from "./work";
import { listAudit } from "./audit-service";
import { can, type Role } from "./permissions";
import { DEMO_TODAY } from "./assumptions";
import type { CurrentUser } from "./session";

/**
 * Data exports. Each dataset says who may download it and builds its rows under the user's own permissions, so an
 * export never contains more than the screen shows: investors get no rent, costs or contacts. Cells hold plain values
 * (numbers stay numbers, in EGP) so the files work in a spreadsheet; headers follow the chosen language.
 */
export type Lang = "en" | "ar";
export type Cell = string | number | null;
export interface Column { key: string; en: string; ar: string; money?: boolean; date?: boolean }
export interface Table { columns: Column[]; rows: Record<string, Cell>[] }
interface Dataset { roles: Role[]; build: (u: CurrentUser, lang: Lang) => Promise<Table> }

const tr = (lang: Lang, ns: string) => {
  const t = createTranslator({ locale: lang, messages: (lang === "ar" ? ar : en) as never, namespace: ns as never }) as unknown as (k: string) => string;
  return (k: string) => { try { return t(k); } catch { return k; } };
};
const col = (key: string, e: string, a: string, extra: Partial<Column> = {}): Column => ({ key, en: e, ar: a, ...extra });
const nm = (lang: Lang, en_: string | null | undefined, ar_: string | null | undefined) => (lang === "ar" ? ar_ : en_) ?? "";

export const DATASETS: Record<string, Dataset> = {
  holdings: {
    roles: ["investor", "manager"],
    async build(u, lang) {
      const ty = tr(lang, "types"), st = tr(lang, "status");
      const rows = await getPortfolio(u);
      return {
        columns: [col("id", "Asset", "الأصل"), col("name", "Name", "الاسم"), col("district", "District", "الحي"), col("type", "Type", "النوع"), col("area", "Area (sqm)", "المساحة (م²)"), col("occupancy", "Occupancy", "الإشغال"), col("value", "Value (EGP)", "القيمة (جنيه)", { money: true }), col("cost", "Cost (EGP)", "التكلفة (جنيه)", { money: true }), col("valueSetOn", "Value set on", "تاريخ القيمة", { date: true })],
        rows: rows.map((r) => ({ id: r.id, name: nm(lang, r.name, r.nameAr), district: nm(lang, r.district.name, r.district.nameAr), type: ty(r.type), area: r.areaSqm, occupancy: st(r.occupancy), value: r.valueEgp, cost: r.costEgp, valueSetOn: r.valueSetOn })),
      };
    },
  },
  leases: {
    roles: ["investor", "manager"],
    async build(u, lang) {
      const d = (await getLeasing(u))!;
      const lt = tr(lang, "lease");
      const money = d.money;
      return {
        columns: [col("lease", "Lease", "العقد"), col("asset", "Asset", "الأصل"), col("tenant", "Tenant", "المستأجر"), col("start", "Start", "البداية", { date: true }), col("end", "End", "النهاية", { date: true }), col("daysLeft", "Days left", "الأيام المتبقية"), col("renewal", "Renewal", "التجديد"),
          ...(money ? [col("rent", "Monthly rent", "الإيجار الشهري", { money: true }), col("currency", "Currency", "العملة"), col("arrears", "Tenant arrears (EGP)", "متأخرات المستأجر (جنيه)", { money: true })] : [])],
        rows: d.tenants.flatMap((t) => t.leases.map((l) => ({
          lease: l.id, asset: `${l.assetId} ${nm(lang, l.assetName, l.assetNameAr)}`, tenant: nm(lang, t.name, t.nameAr), start: l.startDate, end: l.endDate, daysLeft: l.daysLeft,
          renewal: l.renewal ? lt(`st_${l.renewal.status}`) : "", ...(money ? { rent: l.monthlyRent, currency: l.currency, arrears: t.arrearsEgp ?? 0 } : {}),
        }))).sort((a, b) => String(a.end).localeCompare(String(b.end))),
      };
    },
  },
  rent: {
    roles: ["manager"],
    async build(u, lang) {
      const d = (await getLeasing(u))!;
      const lt = tr(lang, "lease");
      return {
        columns: [col("invoice", "Invoice", "الفاتورة"), col("tenant", "Tenant", "المستأجر"), col("asset", "Asset", "الأصل"), col("lease", "Lease", "العقد"), col("period", "Month", "الشهر", { date: true }), col("due", "Due", "الاستحقاق", { date: true }), col("billed", "Billed (EGP)", "المفوتر (جنيه)", { money: true }), col("paid", "Paid (EGP)", "المسدد (جنيه)", { money: true }), col("owed", "Owed (EGP)", "المستحق (جنيه)", { money: true }), col("status", "Status", "الحالة"), col("daysOverdue", "Days overdue", "أيام التأخير")],
        rows: (d.rent?.open ?? []).map((i) => ({ invoice: i.id, tenant: nm(lang, i.tenantName, i.tenantNameAr), asset: `${i.assetId} ${nm(lang, i.assetName, i.assetNameAr)}`, lease: i.leaseId, period: i.period, due: i.dueOn, billed: i.amountEgp, paid: i.paidEgp, owed: i.outstandingEgp, status: lt(`inv_${i.status}`), daysOverdue: i.daysOverdue })),
      };
    },
  },
  ledger: {
    roles: ["manager"],
    async build(u, lang) {
      const f = await getFinance(u);
      const ft = tr(lang, "fin");
      if (!f || !f.money) return { columns: [], rows: [] };
      return {
        columns: [col("date", "Date", "التاريخ", { date: true }), col("category", "Category", "الفئة"), col("asset", "Asset", "الأصل"), col("amount", "Amount (EGP)", "المبلغ (جنيه)", { money: true }), col("memo", "Description", "الوصف"), col("source", "Source", "المصدر"), col("id", "Line", "البند")],
        rows: f.ledger.map((l) => ({ date: l.date, category: ft(`c_${l.category}`), asset: l.assetId ? `${l.assetId} ${nm(lang, l.assetName, l.assetNameAr)}` : ft("portfolioLevel"), amount: l.amountEgp, memo: l.memo, source: l.source === "manual" ? ft("manual") : lang === "ar" ? "العقود" : "Leases", id: l.id })),
      };
    },
  },
  budget: {
    roles: ["manager"],
    async build(u, lang) {
      const f = await getFinance(u);
      const ft = tr(lang, "fin");
      if (!f || !f.money) return { columns: [], rows: [] };
      return {
        columns: [col("category", "Category", "الفئة"), col("budget", "Budget (EGP)", "الموازنة (جنيه)", { money: true }), col("actual", "Actual (EGP)", "الفعلي (جنيه)", { money: true }), col("variance", "Difference (EGP)", "الفرق (جنيه)", { money: true }), col("pct", "Difference (%)", "الفرق (%)")],
        rows: f.bva.map((v) => ({ category: ft(`c_${v.category}`), budget: v.budget, actual: v.actual, variance: v.variance, pct: v.pct === null ? null : Math.round(v.pct * 1000) / 10 })),
      };
    },
  },
  work: {
    roles: ["investor", "manager"],
    async build(u, lang) {
      const w = (await listWork(u))!;
      const wt = tr(lang, "work");
      return {
        columns: [col("id", "Work order", "أمر العمل"), col("kind", "Type", "النوع"), col("asset", "Asset", "الأصل"), col("title", "Title", "العنوان"), col("category", "Category", "الفئة"), col("priority", "Priority", "الأولوية"), col("status", "Status", "الحالة"), col("assignee", "Assigned to", "مسندة إلى"), col("due", "Due", "الاستحقاق", { date: true }), col("overdue", "Overdue", "متأخرة"),
          ...(w.money ? [col("estimate", "Estimate (EGP)", "التقدير (جنيه)", { money: true }), col("actual", "Actual (EGP)", "الفعلي (جنيه)", { money: true })] : [])],
        rows: w.items.map((x) => ({ id: x.id, kind: wt(`k_${x.kind}`), asset: x.assetId ? `${x.assetId} ${nm(lang, x.assetName, x.assetNameAr)}` : wt("portfolioLevel"), title: x.title, category: wt(`c_${x.category}`), priority: wt(`p_${x.priority}`), status: wt(`s_${x.status}`), assignee: nm(lang, x.assigneeName, x.assigneeNameAr), due: x.dueOn, overdue: x.overdue ? (lang === "ar" ? "نعم" : "Yes") : "", ...(w.money ? { estimate: x.estimateEgp, actual: x.actualEgp } : {}) })),
      };
    },
  },
  distributions: {
    roles: ["investor", "manager"],
    async build(u, lang) {
      const f = await getFinance(u);
      const ft = tr(lang, "fin");
      return {
        columns: [col("id", "Distribution", "التوزيع"), col("period", "Quarter", "الربع"), col("amount", "Amount (EGP)", "المبلغ (جنيه)", { money: true }), col("status", "Status", "الحالة"), col("paidOn", "Paid on", "تاريخ الدفع", { date: true })],
        rows: (f?.distributions ?? []).map((d) => ({ id: d.id, period: d.period, amount: d.amountEgp, status: ft(`ds_${d.status}`), paidOn: d.paidOn })),
      };
    },
  },
  audit: {
    roles: ["admin"],
    async build(u) {
      const a = await listAudit(u, { limit: 5000, offset: 0 });
      return {
        columns: [col("seq", "Event", "الحدث"), col("at", "Time (UTC)", "الوقت (UTC)"), col("actor", "Actor", "الفاعل"), col("role", "Role", "الدور"), col("action", "Action", "الإجراء"), col("entity", "Entity", "الكيان"), col("entityId", "Entity id", "معرّف الكيان"), col("hash", "Hash", "البصمة"), col("prevHash", "Previous hash", "البصمة السابقة")],
        rows: (a?.rows ?? []).map((e) => ({ seq: e.seq, at: e.at, actor: e.actorId, role: e.actorRole, action: e.action, entity: e.entity, entityId: e.entityId, hash: e.hash, prevHash: e.prevHash })),
      };
    },
  },
};
export type DatasetId = keyof typeof DATASETS;
export const datasetIdsFor = (role: Role) => (Object.keys(DATASETS) as DatasetId[]).filter((k) => DATASETS[k].roles.includes(role));
export const canExport = (role: Role, id: string) => id in DATASETS && DATASETS[id as DatasetId].roles.includes(role) && can(role, "reports.export");

/** RFC 4180 CSV with a byte-order mark, so Excel opens Arabic text correctly. */
export function toCsv(t: Table, lang: Lang): string {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // A leading = + - @ would be read as a formula by spreadsheet apps; prefix text like that with a quote.
    const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [t.columns.map((c) => esc(c[lang])).join(","), ...t.rows.map((r) => t.columns.map((c) => esc(r[c.key] ?? null)).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** An Excel workbook with one sheet per table: bold header, frozen first row, number formats, right-to-left in Arabic. */
export async function toXlsx(sheets: { name: string; table: Table }[], lang: Lang): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ZMNHOOF OS (sample data)";
  wb.created = new Date(`${DEMO_TODAY}T12:00:00Z`);
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1, rightToLeft: lang === "ar" }] });
    ws.columns = s.table.columns.map((c) => ({ header: c[lang], key: c.key, width: Math.min(48, Math.max(12, c[lang].length + 4)), style: c.money ? { numFmt: "#,##0" } : {} }));
    ws.getRow(1).font = { bold: true };
    for (const r of s.table.rows) ws.addRow(Object.fromEntries(s.table.columns.map((c) => [c.key, r[c.key] ?? null])));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildDataset(user: CurrentUser, id: DatasetId, lang: Lang) {
  return DATASETS[id].build(user, lang);
}
