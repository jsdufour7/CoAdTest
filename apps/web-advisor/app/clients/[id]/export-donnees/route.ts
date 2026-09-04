import { exportClientData } from "@coadvisor/documents";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";

/**
 * Export complet des données du dossier (Loi 25 — accès/portabilité).
 * Permission compliance:read vérifiée dans le service ; audité.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { actor } = await requireAdvisorContext();
  const { id } = await params;
  const meta = await getRequestMeta();

  try {
    const exported = await exportClientData(actor, id, meta);
    return new Response(exported.json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
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
