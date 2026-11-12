import { getDb, withSession } from "../src/db/client";
import * as t from "../src/db/schema";
import { sql } from "drizzle-orm";
(async () => {
  const db = await getDb();
  const tot = await db.execute(sql`select count(*)::int n, sum(value_egp)::bigint v, sum(cost_egp)::bigint c from assets`);
  console.log("assets", tot.rows[0]);
  for (const role of ["investor", "manager", "admin"] as const) {
    const uid = role === "investor" ? "u-investor" : role === "manager" ? "u-manager-1" : "u-admin";
    const r = await withSession({ role, userId: uid }, async (tx) => ({
      assets: (await tx.select().from(t.assets)).length,
      cashflows: (await tx.select().from(t.cashflows)).length,
      leases: (await tx.select().from(t.leases)).length,
      audit: (await tx.select().from(t.auditEvents)).length,
      updates: (await tx.select().from(t.investorUpdates)).length,
    }));
    console.log(role, r);
  }
  const m = await db.execute(sql`select count(*)::int sales from comparable_sales`);
  console.log(m.rows[0]);
  const bad = await withSession({ role: "admin", userId: "u-admin" }, async (tx) => {
    try { await tx.execute(sql`update audit_events set action='x'`); return "UPDATE ALLOWED"; } catch (e) { return "update blocked: " + (e as Error).message.slice(0, 60); }
  });
  console.log(bad);
})().catch((e) => { console.error(e); process.exit(1); });
