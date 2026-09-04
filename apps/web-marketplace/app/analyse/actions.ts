"use server";

import { redirect } from "next/navigation";

import { operatorTenantSlug, trackSafely } from "@coadvisor/analytics";
import { withSystemContext } from "@coadvisor/database";

import { submitAssessment } from "@coadvisor/fnae";
import { DomainError } from "@coadvisor/types";

export interface AnalyseFormState {
  error?: string;
}

/**
 * Soumission du questionnaire public (anonyme).
 * Source « referral » si un cabinet référent a mené le visiteur ici.
 */
export async function submitAssessmentAction(
  _prevState: AnalyseFormState,
  formData: FormData,
): Promise<AnalyseFormState> {
  const cabinetSlug =
    typeof formData.get("cabinetSlug") === "string" &&
    String(formData.get("cabinetSlug")).trim() !== ""
      ? String(formData.get("cabinetSlug")).trim()
      : undefined;

  let target: string;
  let trackedId: string | null = null;
  try {
    const { id, readToken } = await submitAssessment(
      Object.fromEntries(formData),
      cabinetSlug ? "referral" : "marketplace",
    );
    target = `/portrait/${id}?k=${readToken}${cabinetSlug ? `&cabinet=${encodeURIComponent(cabinetSlug)}` : ""}`;
    trackedId = id;
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  // Mesure produit first-party : événement PLATEFORME rattaché au
  // tenant opérateur (le portrait public n'a pas de tenant, ADR-006).
  try {
    await withSystemContext(async (tx) => {
      const operator = await tx.tenant.findUnique({
        where: { slug: operatorTenantSlug() },
        select: { id: true },
      });
      if (operator) {
        await trackSafely(tx, {
          tenantId: operator.id,
          app: "web-marketplace",
          actorKind: "ANONYMOUS",
          name: "assessment.submitted",
          props: { assessmentId: trackedId },
        });
      }
    });
  } catch (cause) {
    console.warn("[analytics] analyse soumise :", cause);
  }

  redirect(target);
}
