import { getStaffSigningView, streamSignerFinalCopy } from "@coadvisor/documents";

import { requireAdvisorContext } from "../../../../lib/advisor-context";

/** Copie finale (avec certificat) — ligne de contre-signature du membre. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ signerId: string }> },
) {
  const { actor } = await requireAdvisorContext();
  const { signerId } = await params;

  const view = await getStaffSigningView(actor, signerId);
  if (!view) {
    return new Response("Cette enveloppe est introuvable.", { status: 404 });
  }

  const result = await streamSignerFinalCopy({
    envelopeId: view.envelopeId,
    channel: "staff",
    userId: actor.userId,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  if (!result) {
    return new Response(
      "La copie finale n'est pas encore prête — elle le sera à la clôture de la ronde.",
      { status: 404 },
    );
  }

  const buffer = new ArrayBuffer(result.bytes.byteLength);
  new Uint8Array(buffer).set(result.bytes);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.document.label.replace(/[^a-zA-Z0-9_-]+/g, "-")}-signe.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
