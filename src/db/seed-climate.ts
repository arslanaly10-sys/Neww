import { asc, eq } from "drizzle-orm";
import type { DB } from "./client";
import * as t from "./schema";

/** Two site-specific assessments: a coastal setback survey on the North Coast and a drainage review in New Cairo. */
export async function seedClimate(db: DB) {
  const coast = (await db.select().from(t.assets).where(eq(t.assets.districtId, "north-coast")).orderBy(asc(t.assets.id)))[0];
  const nc = (await db.select().from(t.assets).where(eq(t.assets.districtId, "new-cairo")).orderBy(asc(t.assets.id)))[0];
  const rows: (typeof t.climateAssessments.$inferInsert)[] = [];
  if (coast) rows.push({ id: "CA-001", assetId: coast.id, hazard: "coastal", level: 3, method: "site_survey", note: "Survey: about 320 m from the shoreline behind the dune, ground about 6 m above mean sea level. Exposed to storm surge in the worst winters; not on the first line.", assessedOn: "2026-04-18", recordedBy: "u-analyst", recordedAt: new Date("2026-04-20T10:00:00Z") });
  if (nc) rows.push({ id: "CA-002", assetId: nc.id, hazard: "flood", level: 2, method: "engineer_report", note: "Compound drainage reviewed by the developer's engineer: storm drains sized for a 1-in-25-year storm, building on raised podium.", assessedOn: "2026-02-10", recordedBy: "u-manager-1", recordedAt: new Date("2026-02-12T10:00:00Z") });
  if (rows.length) await db.insert(t.climateAssessments).values(rows);
}
