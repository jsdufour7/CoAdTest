import { headers } from "next/headers";
import { Readable } from "node:stream";

import { preparePortalDocumentDownload } from "@coadvisor/documents";
import { DomainError } from "@coadvisor/types";

import { getSessionUserFromCookies } from "../../../../../lib/session";

/** Téléchargement portail (partage PORTAL actif ou signature en attente). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const user = await getSessionUserFromCookies();
  if (!user) {
    return new Response("Session requise.", { status: 401 });
  }
  const { documentId } = await params;

  const requestHeaders = await headers();
  const meta = {
    ipAddress: requestHeaders.get("x-forwarded-for") ?? undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };

  try {
    const prepared = await preparePortalDocumentDownload(
      user.userId,
      documentId,
      meta,
    );
    if (!prepared) {
      return new Response("Ce document est introuvable.", { status: 404 });
    }
    const stream = await prepared.openStream();
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": prepared.document.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(prepared.document.originalFilename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return new Response(error.message, { status: 403 });
    }
    throw error;
  }
}
