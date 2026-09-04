import { getPortalSigningView, streamSignerFinalCopy } from "@coadvisor/documents";

import { getSessionUserFromCookies } from "../../../../../lib/session";

/**
 * Copie finale (avec certificat) d'une ronde close — téléchargeable
 * par chaque partie signataire (Sprint 7c), journalisée en audit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ signerId: string }> },
) {
  const user = await getSessionUserFromCookies();
  if (!user) {
    return new Response("Authentification requise.", { status: 401 });
  }
  const { signerId } = await params;

  // Appartenance stricte : MA ligne signataire sur cette enveloppe.
  const view = await getPortalSigningView(user.userId, signerId);
  if (!view) {
    return new Response("Cette enveloppe est introuvable.", { status: 404 });
  }

  const result = await streamSignerFinalCopy({
    envelopeId: view.envelopeId,
    channel: "portal",
    userId: user.userId,
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
