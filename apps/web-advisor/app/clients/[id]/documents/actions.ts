"use server";

import { revalidatePath } from "next/cache";
import { Readable } from "node:stream";

import {
  cancelEnvelope,
  createEnvelope,
  createLinkShare,
  deleteSignatureTemplate,
  generateReport,
  resendEnvelope,
  revokeShare,
  sendEnvelopeReminder,
  shareToPortal,
  softDeleteDocument,
  uploadDocument,
  type ReportKind,
} from "@coadvisor/documents";
import { DOCUMENT_CATEGORY_LABELS } from "@coadvisor/documents/labels";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";

export interface VaultMutationState {
  error?: string;
  success?: string;
  /** Jeton de lien public — affiché une seule fois (jamais relisible). */
  shareToken?: string;
  shareExpiresAt?: string;
  /** Liens de signature externes — affichés une seule fois (7b). */
  externalLinks?: Array<{ email: string; fullName: string; url: string }>;
}

/** Charge utile du créateur d'enveloppe (serialisée en JSON par le client). */
export interface EnvelopeFieldPayload {
  signerIndex: number;
  kind: "SIGNATURE" | "INITIALS" | "DATE";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function toState(fn: () => Promise<VaultMutationState>): Promise<VaultMutationState> {
  return fn().catch((error: unknown) => ({
    error:
      error instanceof DomainError
        ? error.message
        : "Une erreur inattendue est survenue — réessayez ou contactez l'équipe.",
  }));
}

/** Dépose une pièce au coffre (FormData : label, category, file). */
export async function uploadDocumentAction(
  clientId: string,
  _prev: VaultMutationState,
  formData: FormData,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choisissez un fichier à déposer (50 Mo maximum)." };
    }
    const label = String(formData.get("label") ?? "").trim() || file.name.replace(/\.[a-z0-9]{1,8}$/i, "");
    const category = String(formData.get("category") ?? "AUTRE");

    const document = await uploadDocument(
      clientId,
      { label, category },
      {
        fileName: file.name,
        declaredMime: file.type || null,
        declaredSize: file.size,
        stream: Readable.fromWeb(
          file.stream() as unknown as Parameters<typeof Readable.fromWeb>[0],
        ),
      },
      actor,
      meta,
    );
    revalidatePath(`/clients/${clientId}/documents`);
    revalidatePath(`/clients/${clientId}`);
    return {
      success: `« ${document.label} » déposé au coffre (${DOCUMENT_CATEGORY_LABELS[document.category as keyof typeof DOCUMENT_CATEGORY_LABELS] ?? document.category}).`,
    };
  });
}

/** Génère un rapport PDF → déposé au coffre (catégorie Rapport). */
export async function generateReportAction(
  clientId: string,
  kind: ReportKind,
  _prev: VaultMutationState,
  _formData: FormData,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const document = await generateReport(kind, actor, clientId, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    return { success: `Rapport généré et déposé au coffre : « ${document.label} ».` };
  });
}

/** Partage au portail particulier. */
export async function shareToPortalAction(
  clientId: string,
  documentId: string,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const result = await shareToPortal(actor, documentId, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    return {
      success: result.alreadyShared
        ? "Cette pièce était déjà partagée au portail."
        : "Partagée au portail particulier — le client la voit maintenant.",
    };
  });
}

/** Lien public 7 jours — le jeton est retourné UNE SEULE FOIS. */
export async function createLinkShareAction(
  clientId: string,
  documentId: string,
  _prev: VaultMutationState,
  formData: FormData,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const origin =
      process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "http://localhost:3002";
    const recipientEmail = String(formData.get("recipientEmail") ?? "").trim();

    const created = await createLinkShare(
      actor,
      documentId,
      {
        publicBaseUrl: origin,
        recipientEmail: recipientEmail === "" ? undefined : recipientEmail,
      },
      meta,
    );
    const shareUrl = `${origin}/partage/${created.token}`;
    revalidatePath(`/clients/${clientId}/documents`);
    return {
      success: `Lien créé — valide jusqu'au ${created.expiresAt.toLocaleDateString("fr-CA")}.`,
      shareToken: shareUrl,
      shareExpiresAt: created.expiresAt.toLocaleDateString("fr-CA"),
    };
  });
}

/** Demander une signature (client via portail, ou membre du cabinet). */
/**
 * Crée une enveloppe de signature multi-signataires (Sprint 7b) —
 * le client sérialise signataires et champs en objet typé.
 */
export async function createEnvelopeAction(
  clientId: string,
  documentId: string,
  payload: {
    signers: Array<
      | { kind: "PORTAL_USER"; portalUserId: string }
      | { kind: "STAFF"; staffUserId: string }
      | { kind: "EXTERNAL"; email: string; fullName: string }
    >;
    signingMode: "SEQUENTIAL" | "PARALLEL";
    message?: string;
    expiresInDays: number;
    fields: EnvelopeFieldPayload[];
    saveTemplateAs?: string;
  },
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const result = await createEnvelope(actor, documentId, payload, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    revalidatePath(`/clients/${clientId}`);
    return {
      success: `Enveloppe envoyée à ${payload.signers.length} signataire(s) — avis par courriel partis${
        result.externalLinks.length > 0
          ? ". Copiez aussi le lien externe ci-dessous (en développement, le courriel reste au journal serveur)."
          : "."
      }`,
      externalLinks: result.externalLinks,
    };
  });
}

/**
 * « Nouvel envoi » (Sprint 7c) : l'enveloppe close (refusée, annulée
 * ou expirée) repart en un clic — mêmes signataires, mêmes zones,
 * jetons externes régénérés, traçabilité chaînée.
 */
export async function resendEnvelopeAction(
  clientId: string,
  envelopeId: string,
  payload: { message?: string; expiresInDays?: number },
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const result = await resendEnvelope(actor, envelopeId, payload, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/signatures");
    return {
      success: `Nouvel envoi reparti — avis par courriel relancés${
        result.externalLinks.length > 0
          ? ". Liens externes régénérés ci-dessous (les anciens sont morts)."
          : "."
      }`,
      externalLinks: result.externalLinks,
    };
  });
}

/** Annuler une enveloppe ouverte. */
export async function cancelEnvelopeAction(
  clientId: string,
  envelopeId: string,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    await cancelEnvelope(actor, envelopeId, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    return { success: "Enveloppe annulée — les signataires ne peuvent plus y répondre." };
  });
}

/** Relancer les signataires en attente (tour courant). */
export async function remindEnvelopeAction(
  clientId: string,
  envelopeId: string,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const result = await sendEnvelopeReminder(actor, envelopeId, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    return {
      success: `${result.reminded} relance(s) envoyée(s) par courriel (cadence anti-spam : 4 h).`,
    };
  });
}

/** Supprimer un gabarit de champs. */
export async function deleteTemplateAction(
  clientId: string,
  templateId: string,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    await deleteSignatureTemplate(actor, templateId, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    return { success: "Gabarit supprimé." };
  });
}

/** Révoquer un partage (portail ou lien). */
export async function revokeShareAction(
  clientId: string,
  shareId: string,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    await revokeShare(actor, shareId, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    return { success: "Partage révoqué — le lien est inactif dès maintenant." };
  });
}

/** Retirer une pièce (suppression logique + purge du blob chiffré). */
export async function deleteDocumentAction(
  clientId: string,
  documentId: string,
): Promise<VaultMutationState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    await softDeleteDocument(actor, documentId, meta);
    revalidatePath(`/clients/${clientId}/documents`);
    revalidatePath(`/clients/${clientId}`);
    return { success: "Pièce retirée du coffre (le retrait est consigné au journal). " };
  });
}
