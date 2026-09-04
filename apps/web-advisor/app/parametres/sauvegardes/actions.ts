"use server";

import { redirect } from "next/navigation";

import { runBackupNow } from "@coadvisor/documents";
import { AuthorizationError, DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  getTenantSummary,
  requireAdvisorContext,
} from "../../../lib/advisor-context";

/** Bouton « Lancer une sauvegarde maintenant » (opérateur, ADMIN). */
export async function runBackupAction(): Promise<void> {
  const { actor, membership } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  try {
    const { result } = await runBackupNow(
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        role: membership.role,
        tenantSlug: tenant?.slug ?? "",
      },
      await getRequestMeta(),
    );
    redirect(
      `/parametres/sauvegardes?ran=${result.status === "VERIFIED" ? "ok" : "ko"}`,
    );
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof DomainError) {
      redirect(
        `/parametres/sauvegardes?erreur=${encodeURIComponent(error.message)}`,
      );
    }
    throw error;
  }
}
