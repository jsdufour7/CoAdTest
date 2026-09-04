import { streamPortalSignerDocument } from "@coadvisor/documents";

import { getSessionUserFromCookies } from "../../../../../lib/session";

/**
 * Flux PDF « ce que je vais signer » (portail) — identité validée au
 * service (sa ligne + lien actif), lecture journalisée au registre.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ signerId: string }> },
) {
  const user = await getSessionUserFromCookies();
  if (!user) {
    return new Response("Authentification requise.", { status: 401 });
  }
  const { signerId } = await params;

  const result = await streamPortalSignerDocument(user.userId, signerId);
  if (!result) {
    return new Response("Cette pièce est introuvable.", { status: 404 });
  }

  const buffer = new ArrayBuffer(result.bytes.byteLength);
  new Uint8Array(buffer).set(result.bytes);
  return new Response(buffer, {
    headers: {
      "Content-Type": result.document.mimeType,
      "Content-Disposition": 'inline; filename="document-a-signer.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
