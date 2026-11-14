/** Single source of truth for role permissions. The Governance matrix is generated from this map. */
export type Role = "investor" | "manager" | "analyst" | "admin";
export const ROLES: Role[] = ["investor", "manager", "analyst", "admin"];

export const PERMISSIONS = {
  "portfolio.view": { investor: true, manager: true, analyst: true, admin: false },
  "asset.view": { investor: true, manager: true, analyst: true, admin: false },
  "asset.income_costs.view": { investor: false, manager: true, analyst: false, admin: false },
  "valuation.run": { investor: true, manager: true, analyst: false, admin: false },
  "valuation.send_for_review": { investor: true, manager: true, analyst: false, admin: false },
  "valuation.confirm": { investor: false, manager: true, analyst: false, admin: false },
  "horus.use": { investor: true, manager: true, analyst: true, admin: false },
  "reports.export": { investor: true, manager: true, analyst: true, admin: true },
  "reports.schedule": { investor: false, manager: true, analyst: false, admin: false },
  "work.report": { investor: true, manager: true, analyst: false, admin: false },
  "work.manage": { investor: false, manager: true, analyst: false, admin: false },
  "finance.manage": { investor: false, manager: true, analyst: false, admin: false },
  "calendar.manage": { investor: false, manager: true, analyst: false, admin: false },
  "deals.view": { investor: true, manager: true, analyst: true, admin: false },
  "deals.manage": { investor: false, manager: true, analyst: false, admin: false },
  "rent.manage": { investor: false, manager: true, analyst: false, admin: false },
  "help.use": { investor: true, manager: true, analyst: true, admin: true },
  "horus.email": { investor: false, manager: true, analyst: false, admin: false },
  "leads.view": { investor: false, manager: true, analyst: false, admin: true },
  "update.draft": { investor: false, manager: true, analyst: false, admin: false },
  "scenario.run": { investor: true, manager: true, analyst: true, admin: false },
  "scenario.save": { investor: false, manager: true, analyst: false, admin: false },
  "document.confirm_extraction": { investor: false, manager: true, analyst: false, admin: false },
  "pack.generate": { investor: true, manager: true, analyst: false, admin: false },
  "market.view": { investor: true, manager: true, analyst: true, admin: true },
  "alerts.view": { investor: true, manager: true, analyst: true, admin: true },
  "approvals.decide": { investor: false, manager: true, analyst: false, admin: true },
  "governance.view": { investor: true, manager: true, analyst: true, admin: true },
  "audit.view": { investor: false, manager: false, analyst: false, admin: true },
  "audit.verify": { investor: false, manager: false, analyst: false, admin: true },
  "records.edit": { investor: false, manager: true, analyst: false, admin: false },
  "records.verify": { investor: false, manager: false, analyst: true, admin: false },
  "users.manage": { investor: false, manager: false, analyst: false, admin: true },
  "role.change": { investor: false, manager: false, analyst: false, admin: true },
  "demo.reset": { investor: false, manager: false, analyst: false, admin: true },
} as const satisfies Record<string, Record<Role, boolean>>;

export type Permission = keyof typeof PERMISSIONS;
export const can = (role: Role, p: Permission) => PERMISSIONS[p][role];

export const AREAS = ["overview", "portfolio", "asset", "market", "leases", "maintenance", "calendar", "finance", "valuation", "deals", "reports", "notifications", "settings", "users", "governance"] as const;
export type Area = (typeof AREAS)[number];
/** The sidebar's sections, in order. Every area belongs to exactly one. */
export const AREA_GROUPS: { id: "portfolio" | "operations" | "money" | "records"; areas: Area[] }[] = [
  { id: "portfolio", areas: ["overview", "portfolio", "asset", "market"] },
  { id: "operations", areas: ["leases", "maintenance", "calendar"] },
  { id: "money", areas: ["finance", "valuation", "deals"] },
  { id: "records", areas: ["reports", "notifications", "settings", "users", "governance"] },
];
export const AREA_ACCESS: Record<Area, Role[]> = {
  overview: ["investor", "manager", "analyst", "admin"],
  portfolio: ["investor", "manager", "analyst"],
  asset: ["investor", "manager", "analyst"],
  leases: ["investor", "manager"],
  maintenance: ["investor", "manager"],
  calendar: ["investor", "manager"],
  reports: ["investor", "manager", "analyst", "admin"],
  notifications: ["investor", "manager", "analyst", "admin"],
  settings: ["investor", "manager", "analyst", "admin"],
  users: ["admin"],
  finance: ["investor", "manager"],
  valuation: ["investor", "manager", "analyst"],
  deals: ["investor", "manager", "analyst"],
  market: ["investor", "manager", "analyst", "admin"],
  governance: ["investor", "manager", "analyst", "admin"],
};
