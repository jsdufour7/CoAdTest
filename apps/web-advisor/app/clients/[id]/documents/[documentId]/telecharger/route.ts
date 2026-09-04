import { Readable } from "node:stream";

import { prepareDocumentDownload } from "@coadvisor/documents";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../../../lib/advisor-context";

/**
 * Téléchargement conseiller : RBAC + audit « lu » dans le service,
 * puis flux DECHIFFRÉ en continu (jamais de fichier temporaire).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { actor } = await requireAdvisorContext();
  const { documentId } = await params;
  const meta = await getRequestMeta();

  const prepared = await prepareDocumentDownload(actor, documentId, meta);
  if (!prepared) {
    return new Response("Cette pièce est introuvable.", { status: 404 });
  }

  const stream = await prepared.openStream();
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": prepared.document.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(prepared.document.originalFilename)}`,
      "X-Content-SHA256": prepared.document.sha256,
      "Cache-Control": "no-store",
    },
  });
}
