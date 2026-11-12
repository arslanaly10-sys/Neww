import "server-only";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { cashflows, valuations, valueHistory, assets, investorUpdates } from "@/db/schema";
import { getDb, withSession } from "@/db/client";
import type { CurrentUser } from "./session";
import { monthsWindow } from "@/db/seed";

const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

/** Portfolio value and cost by month. Cost steps up when an asset is acquired. */
export async function getHistory(user: CurrentUser) {
  const months = monthsWindow();
  return withSession(sess(user), async (tx) => {
    const v = await tx.select({ month: valueHistory.month, total: sql<number>`sum(${valueHistory.valueEgp})::float8`, n: sql<number>`count(*)::int` })
      .from(valueHistory).groupBy(valueHistory.month).orderBy(asc(valueHistory.month));
    const a = await tx.select({ acquiredOn: assets.acquiredOn, cost: assets.costEgp }).from(assets);
    const byMonth = new Map(v.map((r) => [r.month, r]));
    return months.map((m) => {
      const end = m.slice(0, 8) + "31";
      return {
        month: m,
        value: byMonth.get(m)?.total ?? 0,
        assets: byMonth.get(m)?.n ?? 0,
        cost: a.filter((x) => x.acquiredOn <= end).reduce((s, x) => s + x.cost, 0),
      };
    });
  });
}

export async function getAssetHistory(user: CurrentUser, assetId: string) {
  return withSession(sess(user), async (tx) => {
    const v = await tx.select().from(valueHistory).where(eq(valueHistory.assetId, assetId)).orderBy(asc(valueHistory.month));
    const [a] = await tx.select({ cost: assets.costEgp, acquiredOn: assets.acquiredOn }).from(assets).where(eq(assets.id, assetId));
    return { points: v.map((p) => ({ month: p.month, value: p.valueEgp, cost: a.cost })), cost: a.cost, acquiredOn: a.acquiredOn };
  });
}

export async function getAssetValuations(user: CurrentUser, assetId: string) {
  return withSession(sess(user), (tx) => tx.select().from(valuations).where(eq(valuations.assetId, assetId)).orderBy(asc(valuations.createdAt)));
}

/** Per-asset income and costs. RLS returns rows to managers only; investors get an empty list. */
export async function getAssetCashflows(user: CurrentUser, assetId: string) {
  return withSession(sess(user), (tx) => tx.select().from(cashflows).where(eq(cashflows.assetId, assetId)).orderBy(asc(cashflows.month)));
}

/**
 * Portfolio-level net income, aggregated only. Read on the privileged connection so the investor can see a headline
 * net yield without ever seeing a single asset's income or cost line. Per-asset figures stay hidden from investors.
 */
export async function getAggregateIncome() {
  const db = await getDb();
  const months = monthsWindow().slice(-12);
  const rows = await db.select({
    assetId: cashflows.assetId,
    net: sql<number>`sum(${cashflows.amountEgp})::float8`,
    gross: sql<number>`sum(case when ${cashflows.amountEgp} > 0 then ${cashflows.amountEgp} else 0 end)::float8`,
  }).from(cashflows).where(and(gte(cashflows.month, months[0]))).groupBy(cashflows.assetId);
  return {
    net: rows.reduce((s, r) => s + r.net, 0),
    gross: rows.reduce((s, r) => s + r.gross, 0),
    byAsset: new Map(rows.map((r) => [r.assetId, r.net])),
    from: months[0], to: months[months.length - 1],
  };
}

export async function getUpdates(user: CurrentUser) {
  return withSession(sess(user), (tx) => tx.select().from(investorUpdates).orderBy(sql`${investorUpdates.postedOn} desc`));
}
