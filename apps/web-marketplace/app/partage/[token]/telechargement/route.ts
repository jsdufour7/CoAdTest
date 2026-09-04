import { headers } from "next/headers";
import { Readable } from "node:stream";

import {
  getObjectStorage,
  markPublicShareAccessed,
  resolvePublicShare,
} from "@coadvisor/documents";

/** Téléchargement anonyme via capability token (preuve RLS en GUC). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,90}$/.test(token)) {
    return new Response("Lien invalide.", { status: 404 });
  }

  const share = await resolvePublicShare(token);
  if (!share) {
    return new Response("Ce lien n'est plus valide.", { status: 404 });
  }

  const requestHeaders = await headers();
  await markPublicShareAccessed(share, {
    ipAddress: requestHeaders.get("x-forwarded-for") ?? undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  });

  const stream = await getObjectStorage().openRead(
    share.storageKey,
    share.contentTag,
  );
  const fileName = share.label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 .()_-]+/g, "_");

  const extension = share.mimeType === "application/pdf" ? ".pdf" : "";
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": share.mimeType,
      "Content-Disposition": `attachment; filename="${fileName}${extension ? (fileName.endsWith(extension) ? "" : extension) : ""}"`,
      "X-Content-SHA256": share.sha256,
      "Cache-Control": "no-store",
    },
  });
}
