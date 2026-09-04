import { exportClientData } from "@coadvisor/documents";
import { DomainError, ValidationError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";

/** Export JSON complet d'un dossier client (Loi 25) — ?clientId=… */
export async function GET(request: Request) {
  const { actor } = await requireAdvisorContext();
  const meta = await getRequestMeta();

  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) {
    return new Response("Paramètre clientId manquant.", { status: 400 });
  }

  try {
    const exported = await exportClientData(actor, clientId, meta);
    return new Response(exported.json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DomainError) {
      return new Response(error.message, { status: 403 });
    }
    throw error;
  }
}
