import type { DB } from "./client";
import * as t from "./schema";

/** Report schedules: one investor workbook, one quarterly statement, and a management workbook that is due today. */
export async function seedReports(db: DB) {
  const at = new Date("2026-10-01T09:00:00Z");
  await db.insert(t.reportSchedules).values([
    { id: "RS-001", name: "Monthly investor workbook", kind: "workbook_investor", datasets: ["holdings", "leases", "work", "distributions"], frequency: "monthly", dayOfMonth: 1, recipients: ["karim@sample.test"], lang: "en", nextRunOn: "2026-12-01", createdBy: "u-manager-1", createdAt: at },
    { id: "RS-002", name: "Quarterly investor statement", kind: "statement", datasets: [], frequency: "quarterly", dayOfMonth: 15, recipients: ["karim@sample.test"], lang: "ar", nextRunOn: "2027-01-15", createdBy: "u-manager-1", createdAt: at },
    { id: "RS-003", name: "Management pack: rent, ledger, budget, work", kind: "workbook_management", datasets: ["rent", "ledger", "budget", "work"], frequency: "monthly", dayOfMonth: 10, recipients: ["nour@sample.test", "omar@sample.test"], lang: "en", nextRunOn: "2026-11-10", createdBy: "u-manager-2", createdAt: at },
  ]);
}
