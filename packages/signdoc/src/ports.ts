import type { DbContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

/**
 * ═══════════════════════════════════════════════════════════════
 * PORTS SIGNDOC (ADR-012) — frontières de l'entité autonome
 * ═══════════════════════════════════════════════════════════════
 *
 * Signdoc est un produit de signature électronique COMMERCIALISABLE,
 * pensé comme service d'ID unique TwoDots : il ne connaît NI le
 * coffre documentaire CoAdvisor, NI sa chronologie CRM, NI son
 * moteur de rapports, NI ses courriels. Ces collaborations sont des
 * PORTS injectés à la composition (configureSigndocRuntime) :
 *
 *   audit                  (obligatoire)  registre d'audit immuable
 *   timeline               (facultatif)   horodatage métier externe
 *   mailer                 (facultatif)   avis/relances par courriel
 *   readObject             (obligatoire)  lecture des binaires chiffrés
 *   renderCertificateBlocks(obligatoire)  moteur de rendu du certificat
 *   depositSignedCopy      (obligatoire)  versement de la copie finale
 *
 * Chemin API (sprint SaaS) : une fine couche HTTP (clés API par
 * tenant, mêmes schémas zod en entrée) se branche sur le même
 * contrôleur — aucun changement ici. Le câblage CoAdvisor vit dans
 * @coadvisor/documents (adaptateur), jamais l'inverse.
 * ═══════════════════════════════════════════════════════════════
 */

export interface SigndocAuditRecord {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  newData?: unknown;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface SigndocTimelineEntry {
  clientId: string;
  eventType: "DOCUMENT";
  title: string;
  description?: string;
  source: "SYSTEM";
  createdBy: string;
}

export interface SigndocMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Copie finale d'une enveloppe réglée (SIGNED ou DECLINED) prête à
 * verser : le puits décide du stockage (coffre chiffré chez CoAdvisor,
 * simple retour des octets pour une installation standalone).
 */
export interface SignedCopyDeposit {
  tenantId: string;
  clientId: string;
  requestedById: string;
  category: string;
  label: string;
  bytes: Uint8Array;
  /** SHA-256 hex du PDF final (original estampillé + certificat). */
  sha256: string;
  envelopeId: string;
  /** Partager immédiatement aux liens portail actifs du dossier. */
  autoShareToPortal: boolean;
}

export interface SignedCopyReceipt {
  /** Identifiant de la pièce versée (null si puits « retour brut »). */
  documentId: string | null;
}

/** Blocs de rapport génériques (miroir structurel du moteur PDF cible). */
export type CertBlock =
  | { type: "paragraph"; text: string }
  | { type: "h2"; text: string }
  | { type: "kv"; pairs: Array<[string, string]> }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      columnRatio?: number[];
    };

export interface CertificateRenderInput {
  title: string;
  subtitle: string;
  blocks: CertBlock[];
  footerNote: string;
  engineTag: string;
}

export interface SigndocRuntime {
  audit(tx: DbContext, record: SigndocAuditRecord): Promise<void>;
  timeline?(
    tx: DbContext,
    tenantId: string,
    entry: SigndocTimelineEntry,
  ): Promise<void>;
  mailer?(mail: SigndocMail): Promise<void>;
  readObject(storageKey: string, contentTag: string): Promise<Uint8Array>;
  renderCertificateBlocks(input: CertificateRenderInput): Promise<Uint8Array>;
  depositSignedCopy(copy: SignedCopyDeposit): Promise<SignedCopyReceipt>;
  /** URL publique du parcours de signature externe (service d'ID). */
  externalSignerUrl?(token: string): string;
  /**
   * Garde-fou optionnel appelé AVANT la création d'une enveloppe
   * (monétisation : plafond d'enveloppes/mois du palier, Sprint 8).
   * Lever une erreur de domaine = refus net côté appelant.
   */
  envelopeQuota?(actor: { tenantId: string; userId: string }): Promise<void>;
}

let runtime: SigndocRuntime | null = null;

/**
 * Câble les ports (composition racine de l'app hôte — chez CoAdvisor :
 * adaptateur de @coadvisor/documents). Idempotent : le dernier câblage
 * complet gagne ; appeler tôt au démarrage du processus serveur.
 */
export function configureSigndocRuntime(next: SigndocRuntime): void {
  runtime = next;
}

export function signdocRuntime(): SigndocRuntime {
  if (!runtime) {
    throw new ValidationError(
      "Le moteur de signature n'est pas câblé dans cette application — configuration Signdoc manquante.",
    );
  }
  return runtime;
}

// ═════════════ Adaptateurs tolérants (ports facultatifs) ═════════════

export async function signdocAudit(
  tx: DbContext,
  record: SigndocAuditRecord,
): Promise<void> {
  await signdocRuntime().audit(tx, record);
}

export async function signdocTimeline(
  tx: DbContext,
  tenantId: string,
  entry: SigndocTimelineEntry,
): Promise<void> {
  await signdocRuntime().timeline?.(tx, tenantId, entry);
}

export async function signdocMail(mail: SigndocMail): Promise<void> {
  await signdocRuntime().mailer?.(mail);
}

export async function signdocReadObject(
  storageKey: string,
  contentTag: string,
): Promise<Uint8Array> {
  return signdocRuntime().readObject(storageKey, contentTag);
}

export async function signdocRenderCertificate(
  input: CertificateRenderInput,
): Promise<Uint8Array> {
  return signdocRuntime().renderCertificateBlocks(input);
}

export async function signdocDepositSignedCopy(
  copy: SignedCopyDeposit,
): Promise<SignedCopyReceipt> {
  return signdocRuntime().depositSignedCopy(copy);
}

export function signdocExternalUrl(token: string): string {
  const url = signdocRuntime().externalSignerUrl?.(token);
  if (url) return url;
  const base =
    process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "http://localhost:3002";
  return `${base}/signature/${token}`;
}

/** Adaptateur tolérant du garde-fou d'enveloppes (port facultatif). */
export async function signdocEnvelopeQuota(actor: {
  tenantId: string;
  userId: string;
}): Promise<void> {
  await signdocRuntime().envelopeQuota?.(actor);
}
