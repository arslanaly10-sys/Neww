import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import * as t from "../src/db/schema";
import { GENESIS_HASH, auditHash, canonical } from "../src/lib/hash";
import { PERMISSIONS, ROLES, can } from "../src/lib/permissions";
import { money, pct } from "../src/lib/format";

describe("seed is deterministic (golden values)", () => {
  it("has the documented shape and totals", async () => {
    const db = await getDb();
    const a = (await db.execute(sql`select count(*)::int n, sum(value_egp)::bigint v, sum(cost_egp)::bigint c from assets`)).rows[0] as { n: number; v: string; c: string };
    expect(a.n).toBe(30);
    expect(Number(a.v)).toBe(1025563000);
    expect(Number(a.c)).toBe(494628000);
    const s = (await db.execute(sql`select count(*)::int n from comparable_sales`)).rows[0] as { n: number };
    expect(s.n).toBe(400);
    const d = (await db.execute(sql`select count(*)::int n from districts`)).rows[0] as { n: number };
    expect(d.n).toBe(10);
    const l = (await db.execute(sql`select count(*)::int n from leases`)).rows[0] as { n: number };
    expect(l.n).toBe(20);
  });
});

describe("row-level security", () => {
  const as = (role: "investor" | "manager" | "admin", userId: string) => ({ role, userId });
  it("hides income and costs from the investor", async () => {
    const n = await withSession(as("investor", "u-investor"), async (tx) => (await tx.select().from(t.cashflows)).length);
    expect(n).toBe(0);
  });
  it("shows income and costs to the manager", async () => {
    const n = await withSession(as("manager", "u-manager-1"), async (tx) => (await tx.select().from(t.cashflows)).length);
    expect(n).toBeGreaterThan(100);
  });
  it("gives the administrator no financial content but the audit log", async () => {
    const r = await withSession(as("admin", "u-admin"), async (tx) => ({
      assets: (await tx.select().from(t.assets)).length,
      audit: (await tx.select().from(t.auditEvents)).length,
    }));
    expect(r.assets).toBe(0);
    expect(r.audit).toBeGreaterThan(0);
  });
  it("hides the audit log from non-admins and hides draft updates from investors", async () => {
    const inv = await withSession(as("investor", "u-investor"), async (tx) => ({
      audit: (await tx.select().from(t.auditEvents)).length,
      drafts: (await tx.select().from(t.investorUpdates)).filter((u) => u.status === "draft").length,
    }));
    expect(inv).toEqual({ audit: 0, drafts: 0 });
    const mgr = await withSession(as("manager", "u-manager-1"), async (tx) => (await tx.select().from(t.investorUpdates)).filter((u) => u.status === "draft").length);
    expect(mgr).toBe(1);
  });
  it("refuses to update the audit log", async () => {
    await expect(withSession(as("admin", "u-admin"), (tx) => tx.execute(sql`update audit_events set action = 'x'`))).rejects.toThrow();
  });
  it("enforces separation of duties: a proposer cannot update their own valuation", async () => {
    const res = await withSession(as("manager", "u-manager-1"), async (tx) =>
      (await tx.execute(sql`update valuations set status = 'confirmed' where proposed_by = 'u-manager-1' returning id`)).rows.length);
    expect(res).toBe(0);
  });
});

describe("audit hash chain", () => {
  it("verifies from genesis", async () => {
    const db = await getDb();
    const rows = await db.select().from(t.auditEvents).orderBy(t.auditEvents.seq);
    let prev = GENESIS_HASH;
    for (const r of rows) {
      expect(r.prevHash).toBe(prev);
      const h = auditHash({ seq: r.seq, at: r.at.toISOString(), actorId: r.actorId, actorRole: r.actorRole, action: r.action, entity: r.entity, entityId: r.entityId, detail: r.detail }, prev);
      expect(r.hash).toBe(h);
      prev = r.hash;
    }
  });
  it("canonical JSON ignores key order", () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

describe("permissions", () => {
  it("only managers confirm valuations; only admin reads the audit log", () => {
    expect(ROLES.filter((r) => can(r, "valuation.confirm"))).toEqual(["manager"]);
    expect(ROLES.filter((r) => can(r, "audit.view"))).toEqual(["admin"]);
  });
  it("admin has no financial permissions", () => {
    for (const p of ["portfolio.view", "asset.view", "asset.income_costs.view", "valuation.run", "pack.generate"] as const) expect(PERMISSIONS[p].admin).toBe(false);
  });
  it("investors cannot see income and costs", () => expect(can("investor", "asset.income_costs.view")).toBe(false));
});

describe("formatting", () => {
  it("formats EGP and USD in English and Arabic with western digits", () => {
    expect(money(1025566000, "EGP", "en", { compact: true })).toBe("EGP 1.03bn");
    expect(money(1025566000, "EGP", "ar", { compact: true })).toBe("1.03 مليار جنيه");
    expect(money(1025566000, "USD", "en", { compact: true })).toBe("USD 20.5m");
    expect(money(9500000, "EGP", "en")).toBe("EGP 9,500,000");
    expect(pct(0.1234, "ar")).toMatch(/12\.3/);
  });
});
