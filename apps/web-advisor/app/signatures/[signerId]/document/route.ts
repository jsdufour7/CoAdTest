import { streamStaffSignerDocument } from "@coadvisor/documents";

import { requireAdvisorContext } from "../../../../lib/advisor-context";

/** Flux PDF « ce que je vais contre-signer » (cabinet) — journalisé. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ signerId: string }> },
) {
  const { actor } = await requireAdvisorContext();
  const { signerId } = await params;

  const result = await streamStaffSignerDocument(actor, signerId);
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
