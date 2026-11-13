import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq, inArray } from "drizzle-orm";
import { withSession } from "@/db/client";
import { horusFiles } from "@/db/schema";
import { appendAudit } from "../audit";
import { can } from "../permissions";
import type { CurrentUser } from "../session";

/** Where uploaded bytes are kept. Local disk next to the app; serverless hosts only allow writing under /tmp. */
export const uploadDir = () => process.env.UPLOAD_DIR || (process.env.VERCEL ? "/tmp/zos-uploads" : path.join(process.cwd(), ".data", "uploads"));
export const MAX_BYTES = 8 * 1024 * 1024;
const TEXT_TYPES = /^(text\/(plain|markdown|csv)|application\/json)$/;
const TEXT_EXT = /\.(txt|md|csv|json)$/i;

export type UploadError = "forbidden" | "empty" | "too_large" | "unsupported" | "unreadable";
export interface FileInfo { id: string; name: string; pages: number; chars: number }

async function readText(bytes: Uint8Array, isPdf: boolean): Promise<{ text: string; pages: number }> {
  if (!isPdf) return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), pages: 1 };
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  return { text: (text as string[]).map((p, i) => `[page ${i + 1}]\n${p.trim()}`).join("\n\n"), pages: totalPages };
}

/** Save an uploaded file for Horus: the bytes to disk, the extracted text to the database. */
export async function saveHorusFile(user: CurrentUser, file: File): Promise<{ ok: true; file: FileInfo } | { ok: false; error: UploadError }> {
  if (!can(user.role, "horus.use")) return { ok: false, error: "forbidden" };
  if (!file || file.size === 0) return { ok: false, error: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf && !TEXT_TYPES.test(file.type) && !TEXT_EXT.test(file.name)) return { ok: false, error: "unsupported" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed: { text: string; pages: number };
  try { parsed = await readText(bytes, isPdf); } catch { return { ok: false, error: "unreadable" }; }
  const text = parsed.text.replace(/\u0000/g, "").trim();
  if (!text) return { ok: false, error: "unreadable" };

  const id = `F-${randomBytes(4).toString("hex")}`;
  const name = path.basename(file.name).slice(0, 160) || "file";
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id), bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await withSession({ userId: user.id, role: user.role }, (tx) => tx.insert(horusFiles).values({
    id, userId: user.id, name, mime: isPdf ? "application/pdf" : file.type || "text/plain", size: file.size, pages: parsed.pages, sha256, text: text.slice(0, 200_000), createdAt: new Date(),
  }));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "horus.file_upload", entity: "file", entityId: id, detail: { name, size: file.size, pages: parsed.pages, sha256 } });
  return { ok: true, file: { id, name, pages: parsed.pages, chars: text.length } };
}

/** The signed-in user's files, newest first (row-level security keeps other users' files out). */
export async function listHorusFiles(user: CurrentUser, ids?: string[]) {
  return withSession({ userId: user.id, role: user.role }, (tx) => {
    const q = tx.select({ id: horusFiles.id, name: horusFiles.name, pages: horusFiles.pages, text: horusFiles.text, createdAt: horusFiles.createdAt }).from(horusFiles);
    return (ids ? q.where(inArray(horusFiles.id, ids.length ? ids : ["-"])) : q).orderBy(desc(horusFiles.createdAt)).limit(50);
  });
}
export async function getHorusFile(user: CurrentUser, id: string) {
  const [f] = await withSession({ userId: user.id, role: user.role }, (tx) => tx.select().from(horusFiles).where(eq(horusFiles.id, id)));
  return f ?? null;
}
