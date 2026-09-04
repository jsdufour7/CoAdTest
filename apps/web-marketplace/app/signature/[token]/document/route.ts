import { streamExternalDocument } from "@coadvisor/documents";

/**
 * Lecture de la pièce à signer par un signataire EXTERNE (capability
 * token) — la politique `documents_public_signature` borne en base aux
 * enveloppes ouvertes portant CE jeton ; l'accès est journalisé.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,90}$/.test(token)) {
    return new Response("Lien invalide.", { status: 404 });
  }

  const result = await streamExternalDocument(token);
  if (!result) {
    return new Response("Ce lien n'est plus valide.", { status: 404 });
  }

  const buffer = new ArrayBuffer(result.bytes.byteLength);
  new Uint8Array(buffer).set(result.bytes);
  return new Response(buffer, {
    headers: {
      "Content-Type": result.document.mimeType,
      "Content-Disposition": `inline; filename="document-a-signer.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
