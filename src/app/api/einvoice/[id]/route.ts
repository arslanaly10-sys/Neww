import { getCurrentUser } from "@/lib/session";
import { buildEInvoice } from "@/lib/einvoice";
import { appendAudit } from "@/lib/audit";
import { signedDocument } from "@/lib/einvoice-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/einvoice/RI-…: the unsigned ETA-shaped draft as a JSON file, for managers. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  if (new URL(req.url).searchParams.get("signed") === "1") {
    const s = await signedDocument(user, id);
    if (!s) return new Response("Not signed, not found or not allowed", { status: 404 });
    await appendAudit({ actorId: user.id, actorRole: user.role, action: "einvoice.export", entity: "e_invoice", entityId: s.id, detail: { invoiceId: id, signed: true, keyId: s.keyId } });
    const body = JSON.stringify({ _note: "SIGNED WITH A TEST KEY (RSA-SHA256 over the canonical text), not a CAdES-BES signature from an ITIDA certificate. Not submitted to the Egyptian Tax Authority. Sample data.", keyId: s.keyId, canonicalSha256: s.hash, documents: [s.document] }, null, 2);
    return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="eta-test-signed-${id}.json"`, "Cache-Control": "no-store" } });
  }
  const r = await buildEInvoice(user, id);
  if (!r) return new Response("Not found or not allowed", { status: 404 });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "einvoice.export", entity: "rent_invoice", entityId: r.invoice.id, detail: { ready: r.ready, failed: r.checks.filter((c) => !c.ok).map((c) => c.id) } });
  const body = JSON.stringify({ _note: "UNSIGNED DRAFT for review. Not submitted to the Egyptian Tax Authority. Sample data; VAT treatment is an assumption.", documents: [r.doc] }, null, 2);
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="eta-draft-${r.invoice.id}.json"`, "Cache-Control": "no-store" } });
}
