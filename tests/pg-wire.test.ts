import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

/**
 * Runs the real provisioning path (DDL, seed, RLS, marker, advisory lock) over the PostgreSQL wire protocol with the
 * standard `pg` driver, against a PGlite server. It does not prove Neon itself, but it proves nothing here is PGlite-only.
 */
let server: { start: () => Promise<void>; stop: () => Promise<void> };
let port = 54329;
beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" }) as never;
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.DB_POOL_MAX = "1";
  process.env.DB_DRIVER = "pg";
  globalThis.__zosDb = undefined;
}, 60000);
afterAll(async () => {
  // Close the pg pool before stopping the server, or its idle connection dies mid-teardown as an unhandled error.
  const db = (await globalThis.__zosDb?.catch(() => undefined)) as { $client?: { end?: () => Promise<void> } } | undefined;
  await db?.$client?.end?.();
  globalThis.__zosDb = undefined;
  await server?.stop();
  delete process.env.DATABASE_URL;
});

describe("PostgreSQL wire protocol (pg driver)", () => {
  it("provisions once, seeds deterministically and enforces row-level security", async () => {
    const { getDb, withSession, dbDriver } = await import("../src/db/client");
    const { sql } = await import("drizzle-orm");
    const { assets, cashflows, auditEvents } = await import("../src/db/schema");
    const db = await getDb();
    expect(dbDriver()).toBe("pg");
    const a = (await db.execute(sql`select count(*)::int n, sum(value_egp)::bigint v from assets`)).rows[0] as { n: number; v: string };
    expect(a.n).toBe(30);
    expect(Number(a.v)).toBe(1025563000);
    expect((await db.execute(sql`select count(*)::int n from _zos_provisioned_v4`)).rows[0]).toEqual({ n: 1 });
    expect(await withSession({ role: "investor", userId: "u-investor" }, async (tx) => (await tx.select().from(cashflows)).length)).toBe(0);
    expect(await withSession({ role: "admin", userId: "u-admin" }, async (tx) => (await tx.select().from(assets)).length)).toBe(0);
    expect((await withSession({ role: "admin", userId: "u-admin" }, async (tx) => (await tx.select().from(auditEvents)).length))).toBeGreaterThan(10);
  }, 120000);
  it("serialises audit appends under concurrency without forking the chain", async () => {
    const { appendAudit } = await import("../src/lib/audit");
    const { getDb } = await import("../src/db/client");
    const { auditEvents } = await import("../src/db/schema");
    await Promise.all(Array.from({ length: 4 }, (_, i) => appendAudit({ actorId: "u-manager-1", actorRole: "manager", action: "test.concurrent", entity: "test", entityId: String(i) })));
    const rows = await (await getDb()).select().from(auditEvents).orderBy(auditEvents.seq);
    const seqs = rows.map((r) => r.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    for (let i = 1; i < rows.length; i++) expect(rows[i].prevHash).toBe(rows[i - 1].hash);
  }, 120000);
});
