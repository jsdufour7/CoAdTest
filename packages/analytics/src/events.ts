import { createHash } from "node:crypto";

import type { DbContext } from "@coadvisor/database";

/**
 * Registre des événements produit traqués (ADR-014) — catalogue fermé :
 * chaque événement est une décision produit documentée, jamais un
 * fourre-tout de télémétrie. engineVersion « analytics-1.0 ».
 */
export const PRODUCT_EVENT_NAMES = [
  "auth.staff_login",
  "portal.login",
  "client.created",
  "lead.created",
  "assessment.submitted",
  "contact_request.submitted",
  "document.uploaded",
  "report.generated",
  "signature.envelope_sent",
  "signature.signed",
  "signature.declined",
  "signature.envelope_resent",
  "marketplace.profile_listed",
  "billing.plan_changed",
  "billing.invoice_paid",
  "backup.completed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export type ProductApp = "web-advisor" | "web-client" | "web-marketplace";
export type ProductActorKind =
  | "STAFF"
  | "PORTAL"
  | "EXTERNAL"
  | "ANONYMOUS"
  | "SYSTEM";

/** Libellés FR du tableau de bord (cohérents avec le ton produit). */
export const PRODUCT_EVENT_LABELS: Record<ProductEventName, string> = {
  "auth.staff_login": "Connexion conseiller",
  "portal.login": "Connexion portail",
  "client.created": "Dossier client créé",
  "lead.created": "Prospect créé",
  "assessment.submitted": "Analyse FNAE soumise",
  "contact_request.submitted": "Demande de contact annuaire",
  "document.uploaded": "Pièce déposée au coffre",
  "report.generated": "Rapport PDF généré",
  "signature.envelope_sent": "Enveloppe envoyée",
  "signature.signed": "Signature apposée",
  "signature.declined": "Signature refusée",
  "signature.envelope_resent": "Nouvel envoi après refus",
  "marketplace.profile_listed": "Vitrine annuaire activée",
  "billing.plan_changed": "Changement de palier",
  "billing.invoice_paid": "Facture payée",
  "backup.completed": "Sauvegarde vérifiée",
};

export interface TrackEventInput {
  tenantId: string;
  app: ProductApp;
  actorKind: ProductActorKind;
  actorId?: string | null;
  /**
   * Identifiant de session BRUT — jamais persisté : seul un
   * pseudonyme SHA-256 salé est écrit (mesure de rétention sans
   * pouvoir revenir à la session, Loi 25).
   */
  sessionId?: string | null;
  name: ProductEventName;
  props?: Record<string, unknown>;
}

/** Pseudonyme non réversible d'une session (agrégats DAU/WAU). */
export function pseudonymizeSession(sessionId: string): string {
  return createHash("sha256")
    .update(`product-events:${sessionId}`)
    .digest("hex");
}

/**
 * Écrit un événement DANS la transaction courante (même philosophie
 * que recordAudit : l'événement naît ou meurt avec l'action métier).
 * INSERT brut (jamais de RETURNING) : les contextes publics RLS
 * (annuaire, signature externe) refusent par design la relecture —
 * même pattern que createMany du Sprint 3/6, id généré côté serveur.
 */
export async function trackEvent(
  tx: DbContext,
  input: TrackEventInput,
): Promise<void> {
  const sessionHash = input.sessionId
    ? pseudonymizeSession(input.sessionId)
    : null;
  await tx.$executeRaw`
    INSERT INTO "product_events"
      ("id", "tenant_id", "occurred_at", "app", "actor_kind", "actor_id",
       "session_hash", "name", "props", "engine_version")
    VALUES
      (gen_random_uuid(), ${input.tenantId}::uuid, now(), ${input.app},
       ${input.actorKind}::"ProductEventActorKind", ${input.actorId}::uuid,
       ${sessionHash}, ${input.name},
       ${JSON.stringify(input.props ?? {})}::jsonb, 'analytics-1.0')
  `;
}

/**
 * Variante « au mieux » : la mesure ne doit JAMAIS faire échouer le
 * flux métier (ex. connexion). Trace un avertissement serveur sinon.
 */
export async function trackSafely(
  tx: DbContext,
  input: TrackEventInput,
): Promise<void> {
  try {
    await trackEvent(tx, input);
  } catch (error) {
    console.warn(
      `[analytics] événement ${input.name} non enregistré :`,
      error instanceof Error ? error.message : error,
    );
  }
}
