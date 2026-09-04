import { NextResponse } from "next/server";

import { getInvoicePdf } from "@coadvisor/billing";
import { DomainError } from "@coadvisor/types";

import { requireAdvisorContext } from "../../../../lib/advisor-context";

/**
 * Téléchargement d'une facture PDF (rendu serveur, RLS tenante) :
 * le conseiller ne peut sortir que SES factures.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { actor } = await requireAdvisorContext();
  try {
    const pdf = await getInvoicePdf(actor, id);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="facture-coadvisor.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
