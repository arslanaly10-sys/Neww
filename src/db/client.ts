import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import type { Role } from "@/lib/permissions";

export type DB = PgliteDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __zosDb: Promise<DB> | undefined;
  // eslint-disable-next-line no-var
  var __zosDriver: string | undefined;
}

const LOCK_KEY = 727001; // advisory lock: only one process provisions the database at a time
// Bump the marker when the schema changes: a database provisioned by an older version is rebuilt from the seed.
const MARKER = "_zos_provisioned_v4";

async function readSql() {
  const { readFile, readdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const root = process.cwd();
  const dir = path.join(root, "src/db/migrations");
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const ddl = (await Promise.all(files.map((f) => readFile(path.join(dir, f), "utf8")))).flatMap((s) => s.split("--> statement-breakpoint"));
  const rls = await readFile(path.join(root, "src/db/rls.sql"), "utf8");
  return { ddl, rls };
}

/** Create the schema, load the deterministic seed, apply row-level security, then write the marker. */
async function provision(db: DB, exec: (text: string) => Promise<unknown>) {
  const { ddl, rls } = await readSql();
  for (const stmt of ddl) if (stmt.trim()) await exec(stmt);
  const { seed } = await import("./seed");
  await seed(db);
  await exec(rls);
  await exec(`create table if not exists ${MARKER} (at timestamptz not null default now())`);
  await exec(`insert into ${MARKER} default values`);
}

/**
 * One connection layer for every environment.
 *  - No DATABASE_URL: embedded PGlite, seeded in memory on boot (local development and tests).
 *  - DATABASE_URL on neon.tech: Neon's serverless driver (WebSocket pooling).
 *  - Any other DATABASE_URL: the standard node-postgres driver (Vercel Postgres, RDS, a local server).
 * The provisioning step runs under a PostgreSQL advisory lock, so concurrent serverless instances cannot seed twice.
 */
async function boot(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite();
    const db = drizzlePglite(client, { schema });
    globalThis.__zosDriver = "pglite";
    await provision(db, (t) => client.exec(t));
    return db;
  }

  const neon = /neon\.(tech|build)/.test(url) && process.env.DB_DRIVER !== "pg";
  let db: DB;
  if (neon) {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    db = drizzle(new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) }), { schema }) as unknown as DB;
    globalThis.__zosDriver = "neon";
  } else {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    db = drizzle(new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) }), { schema }) as unknown as DB;
    globalThis.__zosDriver = "pg";
  }
  // Provisioning is one transaction holding an advisory lock: concurrent instances wait, then find the marker and skip.
  // If it fails half way, nothing is committed, so the next boot starts clean.
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`select pg_advisory_xact_lock(${LOCK_KEY})`));
    const ready = (await tx.execute(sql.raw(`select to_regclass('public.${MARKER}') as t`))).rows[0] as { t: string | null };
    if (ready.t) return;
    const partial = (await tx.execute(sql.raw(`select to_regclass('public.users') as t`))).rows[0] as { t: string | null };
    if (partial.t) await tx.execute(sql.raw("drop schema public cascade; create schema public;")); // leftovers of an older version of this demo database
    await provision(tx as unknown as DB, async (t) => tx.execute(sql.raw(t)));
  });
  return db;
}

export function getDb(): Promise<DB> {
  return (globalThis.__zosDb ??= boot().catch((e) => { globalThis.__zosDb = undefined; throw e; }));
}
export const dbDriver = () => globalThis.__zosDriver ?? "unknown";

/** Demo hygiene: wipe everything and load the seed again. Used by the administrator's reset button. */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  if (globalThis.__zosDriver === "pglite") {
    globalThis.__zosDb = undefined;
    await getDb();
    return;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`select pg_advisory_xact_lock(${LOCK_KEY})`));
    await tx.execute(sql.raw("drop schema public cascade; create schema public;"));
    await provision(tx as unknown as DB, async (t) => tx.execute(sql.raw(t)));
  });
}

export interface Session { userId: string; role: Role }

/** Run a callback as the signed-in user: RLS is enforced by switching to the unprivileged app_user role. */
export async function withSession<T>(s: Session, fn: (tx: DB) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_user`);
    await tx.execute(sql`select set_config('app.role', ${s.role}, true), set_config('app.user_id', ${s.userId}, true)`);
    return fn(tx as unknown as DB);
  });
}
