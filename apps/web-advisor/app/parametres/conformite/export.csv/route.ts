import { exportAuditCsv } from "@coadvisor/core-platform";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";

/** CSV du journal filtré (mêmes paramètres que la page Conformité). */
export async function GET(request: Request) {
  const { actor } = await requireAdvisorContext();
  const meta = await getRequestMeta();

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || undefined;
  const entityType = url.searchParams.get("entityType") || undefined;
  const period = url.searchParams.get("period") ?? "30";
  const from =
    period === "all"
      ? undefined
      : new Date(Date.now() - (Number(period) || 30) * 24 * 60 * 60 * 1000);

  try {
    const exported = await exportAuditCsv(
      { ...actor, tenantId: actor.tenantId },
      { action, entityType, from },
      { ipAddress: meta.ipAddress, userAgent: meta.userAgent },
    );
    return new Response(exported.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
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
