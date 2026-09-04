import { createHash } from "node:crypto";

import { signdocRenderCertificate } from "./ports";
import { resolveSignatureStyle } from "./styles";
import { STAMP_ENGINE_VERSION } from "./stamp";
import type { CertBlock } from "./ports";

/**
 * Certificat de signature électronique (ADR-011, ADR-012).
 *
 * signdoc-2.0 (Sprint 7b) : enveloppe multi-signataires complétée.
 * signdoc-2.1 (Sprint 7c) : l'enveloppe close sur REFUS produit
 * aussi un certificat — la ronde est terminée, le document final
 * (signatures recueillies + marqueur de refus + présentes pages)
 * est téléchargeable par toutes les parties. Le certificat inscrit
 * également le style de signature adopté par chaque signataire.
 */
export const SIGNED_DOC_VERSION = "signdoc-2.1";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export interface CertificateSignerEntry {
  fullName: string;
  /** Nom tapé au moment de signer (peut différer du nom d'affichage). */
  signerName: string;
  kind: "PORTAL_USER" | "STAFF" | "EXTERNAL";
  email: string;
  /** SIGNED : horodatage de signature; DECLINED : horodatage du refus. */
  signedAt: Date;
  outcome: "SIGNED" | "DECLINED";
  declineReason?: string | undefined;
  /** Identifiant de style adopté (registre signdoc). */
  signatureStyle?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  consentText: string;
  /** Signature tracée (canvas) jointe, sinon nom tapé. */
  drawn: boolean;
}

export interface EnvelopeCertInfo {
  envelopeId: string;
  documentLabel: string;
  documentId: string;
  originalSha256: string;
  firmName: string;
  signingMode: "SEQUENTIAL" | "PARALLEL";
  /** SIGNED (tous) ou DECLINED (au moins un refus — ronde close). */
  outcome: "SIGNED" | "DECLINED";
  signers: CertificateSignerEntry[];
}

const SIGNER_CHANNEL_LABELS: Record<CertificateSignerEntry["kind"], string> = {
  PORTAL_USER: "Portail particulier CoAdvisor (session authentifiée)",
  STAFF: "Espace conseiller CoAdvisor (session authentifiée)",
  EXTERNAL: "Lien de signature sécurisé par courriel (jeton unique)",
};

function formatInstant(date: Date): string {
  return `${date.toLocaleString("fr-CA", {
    dateStyle: "long",
    timeStyle: "medium",
  })} (UTC locale serveur)`;
}

/** Blocs du certificat (pur — testé sans moteur de rendu PDF). */
export function buildCertificateBlocks(info: EnvelopeCertInfo): CertBlock[] {
  const declined = info.signers.filter((signer) => signer.outcome === "DECLINED");
  const signed = info.signers.filter((signer) => signer.outcome === "SIGNED");

  const intro =
    info.outcome === "SIGNED"
      ? "Ce certificat atteste les signatures électroniques simples du document ci-dessous, conformément à l'art. 2827 du Code civil du Québec : le lien entre chaque personne signataire et le document est assuré par le nom tapé (ou la signature tracée), le consentement explicite consigné, l'horodatage et l'empreinte numérique (SHA-256) du document. Les vignettes de signature ont été apposées aux emplacements désignés dans le document. L'intégrité subséquente du document est vérifiable en recalculant l'empreinte SHA-256 du fichier original (les pages du présent certificat exclues)."
      : `Ce certificat constate la CLÔTURE SUR REFUS de la ronde de signature du document ci-dessous : ${declined
          .map((signer) => signer.signerName)
          .join(", ")} a refusé de signer ; le motif est consigné en preuve ci-dessous et le marqueur de refus figure dans le document aux emplacements qui lui étaient désignés. ${
          signed.length > 0
            ? "Les signatures déjà recueillies avant le refus demeurent attestées aux pages suivantes avec leurs preuves complètes. "
            : ""
        }Le lien entre chaque personne ayant signé et le document est assuré conformément à l'art. 2827 du Code civil du Québec (nom tapé ou signature tracée, consentement explicite, horodatage, empreinte SHA-256 de l'original, certificat exclu).`;

  const blocks: CertBlock[] = [
    { type: "paragraph", text: intro },
    {
      type: "kv",
      pairs: [
        ["Document", info.documentLabel],
        ["Identifiant de l'enveloppe", info.envelopeId],
        ["Identifiant interne du document", info.documentId],
        ["Empreinte SHA-256 du document original", info.originalSha256],
        ["Cabinet", info.firmName],
        [
          "Issue de la ronde",
          info.outcome === "SIGNED"
            ? "Complétée — toutes les parties ont signé"
            : "Close sur refus — la ronde est terminée sans signature complète",
        ],
        [
          "Ordre de signature",
          info.signingMode === "SEQUENTIAL"
            ? "Séquentiel (dans l'ordre prévu)"
            : "En parallèle (ordre libre)",
        ],
      ],
    },
    { type: "h2", text: `Signataires (${info.signers.length})` },
    {
      type: "table",
      headers: ["Nom", "Canal", "Décision", "Date"],
      rows: info.signers.map((signer) => [
        signer.signerName,
        signer.kind === "PORTAL_USER"
          ? "Client (portail)"
          : signer.kind === "STAFF"
            ? "Cabinet"
            : "Externe",
        signer.outcome === "SIGNED" ? "Signée" : "Refusée",
        formatInstant(signer.signedAt),
      ]),
      columnRatio: [0.28, 0.18, 0.14, 0.4],
    },
  ];

  info.signers.forEach((signer, index) => {
    const style = signer.signatureStyle
      ? resolveSignatureStyle(signer.signatureStyle).style.label
      : null;
    if (signer.outcome === "SIGNED") {
      blocks.push(
        {
          type: "h2",
          text: `Preuve — ${signer.signerName} (${index + 1}/${info.signers.length})`,
        },
        {
          type: "kv",
          pairs: [
            ["Nom d'affichage à l'invitation", signer.fullName],
            ["Nom tapé à la signature", signer.signerName],
            ["Courriel", signer.email],
            ["Canal", SIGNER_CHANNEL_LABELS[signer.kind]],
            ["Signée le", formatInstant(signer.signedAt)],
            [
              "Mode d'apposition",
              signer.drawn
                ? "Signature tracée à l'écran"
                : `Nom tapé — style « ${style ?? "Classique"} »`,
            ],
            ["Adresse IP", signer.ipAddress ?? "non consignée"],
            ["Agent utilisateur", signer.userAgent ?? "non consigné"],
          ],
        },
        { type: "paragraph", text: `« ${signer.consentText} »` },
      );
    } else {
      blocks.push(
        {
          type: "h2",
          text: `Refus — ${signer.signerName} (${index + 1}/${info.signers.length})`,
        },
        {
          type: "kv",
          pairs: [
            ["Nom d'affichage à l'invitation", signer.fullName],
            ["Nom tapé au refus", signer.signerName],
            ["Courriel", signer.email],
            ["Canal", SIGNER_CHANNEL_LABELS[signer.kind]],
            ["Refusée le", formatInstant(signer.signedAt)],
            ["Adresse IP", signer.ipAddress ?? "non consignée"],
            ["Agent utilisateur", signer.userAgent ?? "non consigné"],
          ],
        },
        {
          type: "paragraph",
          text: `Motif déclaré : « ${signer.declineReason ?? "non précisé"} »`,
        },
        {
          type: "paragraph",
          text:
            "Le refus de signer clôt la ronde : le document n'est PAS exécutoire en l'état. " +
            "Une nouvelle ronde peut être ouverte par « nouvel envoi » de l'enveloppe, qui laisse " +
            "le présent certificat intégralement traçable.",
        },
      );
    }
  });

  blocks.push({
    type: "paragraph",
    text:
      "L'empreinte du présent document final (ces pages incluses) est consignée au registre d'audit immuable du cabinet, avec l'événement horodaté de règlement de l'enveloppe. Toute modification ultérieure invalide la comparaison d'empreintes.",
  });
  return blocks;
}

/** Page(s) certificat listant TOUS les signataires de l'enveloppe. */
export async function buildCertificatePdf(
  info: EnvelopeCertInfo,
): Promise<Uint8Array> {
  return signdocRenderCertificate({
    title: "Certificat de signatures électroniques",
    subtitle: `${info.documentLabel} — ${info.firmName}`,
    blocks: buildCertificateBlocks(info),
    footerNote: `Certificat de preuve généré par Signdoc (${SIGNED_DOC_VERSION}) — document à conserver avec la pièce signée.`,
    engineTag: `${SIGNED_DOC_VERSION} · ${STAMP_ENGINE_VERSION} · pdfrender-1.0`,
  });
}

/**
 * Fusionne : pages de l'original d'abord (déjà estampillées par le
 * moteur de champs), certificat multi-signataires à la fin.
 */
export async function mergeWithCertificate(
  stampedBytes: Uint8Array,
  certificateBytes: Uint8Array,
): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const stamped = await PDFDocument.load(stampedBytes, {
    ignoreEncryption: true,
  });
  const certificateDoc = await PDFDocument.load(certificateBytes);
  const merged = await PDFDocument.create();
  for (const page of await merged.copyPages(stamped, stamped.getPageIndices())) {
    merged.addPage(page);
  }
  for (const page of await merged.copyPages(
    certificateDoc,
    certificateDoc.getPageIndices(),
  )) {
    merged.addPage(page);
  }
  return merged.save({ useObjectStreams: false });
}

/**
 * Compatibilité v1 (flux hérité du Sprint 7) — conservée pour la
 * continuité des preuves historiques.
 */
export interface SignatureCertInfo {
  documentLabel: string;
  documentId: string;
  originalSha256: string;
  signerName: string;
  signedAt: Date;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  consentText: string;
  firmName: string;
  via: "portal" | "cabinet";
}

export async function buildSignedPdf(
  originalBytes: Uint8Array,
  info: SignatureCertInfo,
): Promise<Uint8Array> {
  const certificate = await buildCertificatePdf({
    envelopeId: "héritée",
    documentLabel: info.documentLabel,
    documentId: info.documentId,
    originalSha256: info.originalSha256,
    firmName: info.firmName,
    signingMode: "SEQUENTIAL",
    outcome: "SIGNED",
    signers: [
      {
        fullName: info.signerName,
        signerName: info.signerName,
        kind: info.via === "portal" ? "PORTAL_USER" : "STAFF",
        email: "non consigné (enveloppe héritée)",
        signedAt: info.signedAt,
        outcome: "SIGNED",
        ipAddress: info.ipAddress,
        userAgent: info.userAgent,
        consentText: info.consentText,
        drawn: false,
      },
    ],
  });
  return mergeWithCertificate(originalBytes, certificate);
}
