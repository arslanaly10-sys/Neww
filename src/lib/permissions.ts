/** Single source of truth for role permissions. The Governance matrix is generated from this map. */
export type Role = "investor" | "manager" | "admin";
export const ROLES: Role[] = ["investor", "manager", "admin"];

export const PERMISSIONS = {
  "portfolio.view": { investor: true, manager: true, admin: false },
  "asset.view": { investor: true, manager: true, admin: false },
  "asset.income_costs.view": { investor: false, manager: true, admin: false },
  "valuation.run": { investor: true, manager: true, admin: false },
  "valuation.send_for_review": { investor: true, manager: true, admin: false },
  "valuation.confirm": { investor: false, manager: true, admin: false },
  "horus.use": { investor: true, manager: true, admin: false },
  "reports.export": { investor: true, manager: true, admin: true },
  "reports.schedule": { investor: false, manager: true, admin: false },
  "work.report": { investor: true, manager: true, admin: false },
  "work.manage": { investor: false, manager: true, admin: false },
  "finance.manage": { investor: false, manager: true, admin: false },
  "calendar.manage": { investor: false, manager: true, admin: false },
  "deals.view": { investor: true, manager: true, admin: false },
  "deals.manage": { investor: false, manager: true, admin: false },
  "rent.manage": { investor: false, manager: true, admin: false },
  "help.use": { investor: true, manager: true, admin: true },
  "horus.email": { investor: false, manager: true, admin: false },
  "leads.view": { investor: false, manager: true, admin: true },
  "update.draft": { investor: false, manager: true, admin: false },
  "scenario.run": { investor: true, manager: true, admin: false },
  "scenario.save": { investor: false, manager: true, admin: false },
  "document.confirm_extraction": { investor: false, manager: true, admin: false },
  "pack.generate": { investor: true, manager: true, admin: false },
  "market.view": { investor: true, manager: true, admin: true },
  "alerts.view": { investor: true, manager: true, admin: true },
  "approvals.decide": { investor: false, manager: true, admin: true },
  "governance.view": { investor: true, manager: true, admin: true },
  "audit.view": { investor: false, manager: false, admin: true },
  "audit.verify": { investor: false, manager: false, admin: true },
  "role.change": { investor: false, manager: false, admin: true },
  "demo.reset": { investor: false, manager: false, admin: true },
} as const satisfies Record<string, Record<Role, boolean>>;

export type Permission = keyof typeof PERMISSIONS;
export const can = (role: Role, p: Permission) => PERMISSIONS[p][role];

export const AREAS = ["overview", "portfolio", "asset", "market", "leases", "maintenance", "calendar", "finance", "valuation", "deals", "reports", "notifications", "governance"] as const;
export type Area = (typeof AREAS)[number];
/** The sidebar's sections, in order. Every area belongs to exactly one. */
export const AREA_GROUPS: { id: "portfolio" | "operations" | "money" | "records"; areas: Area[] }[] = [
  { id: "portfolio", areas: ["overview", "portfolio", "asset", "market"] },
  { id: "operations", areas: ["leases", "maintenance", "calendar"] },
  { id: "money", areas: ["finance", "valuation", "deals"] },
  { id: "records", areas: ["reports", "notifications", "governance"] },
];
export const AREA_ACCESS: Record<Area, Role[]> = {
  overview: ["investor", "manager", "admin"],
  portfolio: ["investor", "manager"],
  asset: ["investor", "manager"],
  leases: ["investor", "manager"],
  maintenance: ["investor", "manager"],
  calendar: ["investor", "manager"],
  reports: ["investor", "manager", "admin"],
  notifications: ["investor", "manager", "admin"],
  finance: ["investor", "manager"],
  valuation: ["investor", "manager"],
  deals: ["investor", "manager"],
  market: ["investor", "manager", "admin"],
  governance: ["investor", "manager", "admin"],
};
