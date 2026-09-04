import { NextResponse } from "next/server";

import { getListedProfilePhoto } from "@coadvisor/marketplace";

/**
 * Photo publique d'un conseiller LISTÉ — servie DEPUIS LE COFFRE
 * chiffré (Sprint 8) : le flux anonyme ne touche jamais le disque,
 * le déchiffrement se fait en mémoire au fil de l'eau.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const photo = await getListedProfilePhoto(id);
  if (!photo) {
    return NextResponse.json({ error: "Photo introuvable." }, { status: 404 });
  }
  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      "content-type": photo.mimeType,
      "content-length": String(photo.bytes.length),
      // Donnée publique par nature (profil listé) : cache CDN 1 h.
      "cache-control": "public, max-age=3600",
    },
  });
}
