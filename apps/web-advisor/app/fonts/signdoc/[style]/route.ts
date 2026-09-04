import {
  readStyleFontBytes,
  resolveSignatureStyle,
  signdocFontContentType,
  signdocFontPublicName,
} from "@coadvisor/signdoc";

/**
 * Service des polices de signature Signdoc (SIL OFL) pour l'aperçu
 * navigateur — allowlist du registre, cache immutable.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ style: string }> },
) {
  const { style: styleId } = await params;
  if (signdocFontPublicName(styleId) === null) {
    return new Response("Style inconnu.", { status: 404 });
  }
  const bytes = await readStyleFontBytes(resolveSignatureStyle(styleId).style);
  if (!bytes) {
    return new Response("Police standard — rien à servir.", { status: 404 });
  }
  const copy = new Uint8Array(bytes);
  return new Response(copy.buffer, {
    headers: {
      "Content-Type": signdocFontContentType(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
