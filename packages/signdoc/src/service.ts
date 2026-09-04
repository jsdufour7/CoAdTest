import { randomBytes } from "node:crypto";

import { hashSessionToken, requirePermission } from "@coadvisor/auth";
import {
  withSignatureTokenContext,
  withSystemContext,
  withTenantContext,
} from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import {
  buildCertificatePdf,
  mergeWithCertificate,
  sha256Hex,
} from "./cert-pdf";
import {
  LEGACY_TO_SIGN_SUFFIX,
  SIGNATURE_CONSENT_TEXT,
  SIGNATURE_REMINDER_INTERVAL_HOURS,
} from "./labels";
import {
  signdocAudit,
  signdocDepositSignedCopy,
  signdocEnvelopeQuota,
  signdocExternalUrl,
  signdocMail,
  signdocReadObject,
  signdocTimeline,
} from "./ports";
import {
  envelopeCreateSchema,
  envelopeResendSchema,
  signatureDeclineSchema,
  signatureSubmitSchema,
} from "./schemas";
import { deriveInitials, stampSignatureFields } from "./stamp";
import { resolveSignatureStyle } from "./styles";
import { parseOrThrow } from "./types";
import type { RequestMeta, SigndocActor } from "./types";

// ─────────────────────────────────────────────────────────────
// Signdoc — cycle de vie des enveloppes multi-signataires
// (ADR-011, autonomisé par ADR-012 au Sprint 7c).
//
// Canaux : PORTAL_USER (client ET conjoint — liens portail ACTIVE),
// STAFF (contre-signature du conseiller), EXTERNAL (lien courriel à
// jeton capability — la RLS n'expose que SA ligne et y exige le
// dépôt des preuves). L'AGRÉGATION d'enveloppe (PARTIALLY_SIGNED,
// SIGNED, DECLINED, production de la copie certifiée) est TOUJOURS
// relue et appliquée en contexte système.
//
// Sprint 7c : le refus CLÔT la ronde MAIS produit aussi la copie
// constatante (marqueurs de refus + certificat) — téléchargeable
// par toutes les parties ; « nouvel envoi » clone l'enveloppe ;
// console cabinet (listSignatureDesk) ; signature adoptée à style.
// Toutes les collaborations hors domaine passent par les PORTS
// (ports.ts) — jamais d'import d'un autre module métier.
// ─────────────────────────────────────────────────────────────

const ACTIVE_ENVELOPE_STATUSES = ["REQUESTED", "PARTIALLY_SIGNED"] as const;

type SignerStatus = "PENDING" | "SIGNED" | "DECLINED";

interface SignerLite {
  id: string;
  kind: "PORTAL_USER" | "STAFF" | "EXTERNAL";
  userId: string | null;
  email: string;
  fullName: string;
  sortOrder: number;
  status: SignerStatus;
}

function ensureSignableDocument(document: { mimeType: string } | null): void {
  if (!document) {
    throw new ValidationError("Cette pièce est introuvable.");
  }
  if (document.mimeType !== "application/pdf") {
    throw new ValidationError(
      "Seules les pièces PDF peuvent être signées électroniquement pour l'instant — convertissez le fichier en PDF d'abord.",
    );
  }
}

/** Tour de signature : plus petit sort_order parmi les PENDING. */
function currentTurnOrder(
  signers: Array<Pick<SignerLite, "sortOrder" | "status">>,
): number | null {
  const pending = signers
    .filter((signer) => signer.status === "PENDING")
    .map((signer) => signer.sortOrder);
  return pending.length === 0 ? null : Math.min(...pending);
}

function isEnvelopeLive(envelope: {
  status: string;
  expiresAt: Date | null;
}): boolean {
  return (
    (ACTIVE_ENVELOPE_STATUSES as readonly string[]).includes(
      envelope.status,
    ) &&
    (!envelope.expiresAt || envelope.expiresAt.getTime() > Date.now())
  );
}

// ═══════════════════════ NOTIFICATIONS ═══════════════════════

async function notifySigner(params: {
  signer: { kind: SignerLite["kind"]; email: string; fullName: string };
  documentLabel: string;
  clientName: string;
  message: string | null;
  turn: "first" | "next" | "reminder";
  externalUrl?: string | undefined;
}): Promise<void> {
  const { signer, documentLabel, clientName, message, turn, externalUrl } =
    params;
  const subject =
    turn === "reminder"
      ? `Rappel — signature attendue : ${documentLabel}`
      : turn === "next"
        ? `À votre tour de signer : ${documentLabel}`
        : `Un document attend votre signature : ${documentLabel}`;
  const channelLines =
    signer.kind === "PORTAL_USER"
      ? [
          "Ouvrez votre espace particulier CoAdvisor, section Documents : le document s'affiche et vous signez directement dessus.",
        ]
      : signer.kind === "STAFF"
        ? [
            "Ouvrez votre espace conseiller CoAdvisor, section Signatures : le document s'affiche et vous signez directement dessus.",
          ]
        : [
            "Ouvrez ce lien sécurisé (usage unique, lié à votre courriel) : le document s'affiche et vous signez directement dessus.",
            externalUrl ?? "(lien indisponible)",
          ];
  const lines = [
    `Bonjour ${signer.fullName},`,
    "",
    `Le document « ${documentLabel} » (dossier : ${clientName}) attend votre signature électronique.`,
    ...(message ? ["", `Mot du professionnel : « ${message} »`] : []),
    "",
    ...channelLines,
    "",
    "Vous pouvez aussi refuser de signer avec motif — le professionnel en sera avisé.",
    "",
    "— CoAdvisor (TwoDots.ca)",
  ];
  try {
    await signdocMail({ to: signer.email, subject, text: lines.join("\n") });
  } catch {
    // Courriel best-effort : jamais bloquant pour la ronde.
  }
}

/**
 * Avis initiaux d'une enveloppe neuve (ou clonée) : séquentiel →
 * premier tour ; parallèle → tout le monde. Retourne les liens
 * externes à remettre au demandeur.
 */
async function notifyInitialTurn(params: {
  signers: Array<{
    kind: SignerLite["kind"];
    email: string;
    fullName: string;
    token: string | null;
  }>;
  signingMode: "SEQUENTIAL" | "PARALLEL";
  documentLabel: string;
  clientName: string;
  message: string | null;
}): Promise<ExternalInviteLink[]> {
  const externalLinks: ExternalInviteLink[] = [];
  for (const [sortOrder, signer] of params.signers.entries()) {
    const isFirstTurn =
      params.signingMode === "PARALLEL" || sortOrder === 0;
    if (signer.kind === "EXTERNAL" && signer.token) {
      externalLinks.push({
        email: signer.email,
        fullName: signer.fullName,
        url: signdocExternalUrl(signer.token),
      });
    }
    if (!isFirstTurn) continue;
    await notifySigner({
      signer,
      documentLabel: params.documentLabel,
      clientName: params.clientName,
      message: params.message,
      turn: "first",
      externalUrl: signer.token ? signdocExternalUrl(signer.token) : undefined,
    });
  }
  return externalLinks;
}

interface ResolvedSigner {
  kind: SignerLite["kind"];
  userId: string | null;
  email: string;
  fullName: string;
  token: string | null;
  tokenHash: string | null;
}

export interface ExternalInviteLink {
  email: string;
  fullName: string;
  url: string;
}

/**
 * Composition d'une enveloppe : signataires (couple portail, cabinet,
 * externe), champs positionnés obligatoires par signataire, ordre,
 * échéance, gabarit optionnel. Avis envoyés selon l'ordre.
 */
export async function createEnvelope(
  actor: SigndocActor,
  documentId: string,
  rawInput: unknown,
  meta: RequestMeta = {},
): Promise<{ envelopeId: string; externalLinks: ExternalInviteLink[] }> {
  requirePermission(actor.role, "documents:write");
  const input = parseOrThrow(envelopeCreateSchema, rawInput);

  const { envelopeId, resolvedSigners, documentLabel, clientId } =
    await buildEnvelopeFromResolved(actor, documentId, input, null, meta);

  const client = await withSystemContext((tx) =>
    tx.client.findFirst({
      where: { id: clientId },
      select: { firstName: true, lastName: true },
    }),
  );
  const clientName = client
    ? `${client.firstName} ${client.lastName}`
    : "Client";

  const externalLinks = await notifyInitialTurn({
    signers: resolvedSigners,
    signingMode: input.signingMode,
    documentLabel,
    clientName,
    message: input.message ?? null,
  });

  return { envelopeId, externalLinks };
}

/** Résolution des comptes + création transactionnelle partagée. */
async function buildEnvelopeFromResolved(
  actor: SigndocActor,
  documentId: string,
  input: ReturnType<typeof parseOrThrow<typeof envelopeCreateSchema>>,
  resentFromId: string | null,
  meta: RequestMeta,
  presetSigners?: ResolvedSigner[],
): Promise<{
  envelopeId: string;
  resolvedSigners: ResolvedSigner[];
  documentLabel: string;
  clientId: string;
}> {
  // ── Résolution AVANT la transaction métier : lectures système
  // DISTINCTES (RLS users_access), jamais de contextes imbriqués.
  const clientScoped = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, status: "ACTIVE" },
      });
      ensureSignableDocument(document);
      return document!;
    },
  );

  const resolvedSigners_: ResolvedSigner[] =
    presetSigners ?? (await resolveEnvelopeSigners(actor, clientScoped.clientId, input.signers));

  // Garde-fou de monétisation (port facultatif — Sprint 8, ADR-013) :
  // l'hôte peut plafonner les enveloppes créées par mois civil.
  await signdocEnvelopeQuota({ tenantId: actor.tenantId, userId: actor.userId });

  const created = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const active = await tx.documentSignature.findFirst({
        where: { documentId, status: { in: [...ACTIVE_ENVELOPE_STATUSES] } },
      });
      if (active) {
        throw new ValidationError(
          "Une enveloppe de signature est déjà en cours pour cette pièce.",
        );
      }
      const alreadySigned = await tx.documentSignature.findFirst({
        where: { documentId, status: "SIGNED" },
      });
      if (alreadySigned) {
        throw new ValidationError(
          "Cette pièce a déjà été signée — la copie certifiée figure au coffre.",
        );
      }

      const expiresAt = new Date(
        Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
      );

      const envelope = await tx.documentSignature.create({
        data: {
          tenantId: actor.tenantId,
          documentId,
          signingMode: input.signingMode,
          message: input.message ?? null,
          expiresAt,
          requestedById: actor.userId,
          resentFromId,
        },
      });

      const signerIds: string[] = [];
      for (
        let sortOrder = 0;
        sortOrder < resolvedSigners_.length;
        sortOrder += 1
      ) {
        const resolved = resolvedSigners_[sortOrder]!;
        const row = await tx.signatureSigner.create({
          data: {
            tenantId: actor.tenantId,
            signatureId: envelope.id,
            kind: resolved.kind,
            userId: resolved.userId,
            email: resolved.email,
            fullName: resolved.fullName,
            sortOrder,
            tokenHash: resolved.tokenHash,
          },
        });
        signerIds.push(row.id);
      }

      for (const field of input.fields) {
        const signerId = signerIds[field.signerIndex];
        if (!signerId) {
          throw new ValidationError(
            "Un champ est assigné à un signataire inexistant.",
          );
        }
        await tx.signatureField.create({
          data: {
            tenantId: actor.tenantId,
            signatureId: envelope.id,
            signerId,
            pageIndex: field.pageIndex,
            kind: field.kind,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
          },
        });
      }

      if (input.saveTemplateAs) {
        await tx.signatureTemplate.create({
          data: {
            tenantId: actor.tenantId,
            name: input.saveTemplateAs,
            fields: input.fields,
            createdById: actor.userId,
          },
        });
      }

      await signdocTimeline(tx, actor.tenantId, {
        clientId: clientScoped.clientId,
        eventType: "DOCUMENT",
        title: resentFromId
          ? `Enveloppe de signature relancée (nouvel envoi) : ${clientScoped.label}`
          : `Enveloppe de signature créée : ${clientScoped.label}`,
        description: `${resolvedSigners_.length} signataire(s) — ${
          input.signingMode === "SEQUENTIAL" ? "séquentiel" : "parallèle"
        }, échéance ${input.expiresInDays} j.`,
        source: "SYSTEM",
        createdBy: actor.userId,
      });

      await signdocAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: resentFromId
          ? "documents.signature.envelope.resent"
          : "documents.signature.envelope.requested",
        entityType: "DocumentSignature",
        entityId: envelope.id,
        newData: {
          documentId,
          label: clientScoped.label,
          signingMode: input.signingMode,
          expiresInDays: input.expiresInDays,
          ...(resentFromId ? { resentFromId } : {}),
          signers: resolvedSigners_.map((signer, index) => ({
            sortOrder: index,
            kind: signer.kind,
            email: signer.email,
            fullName: signer.fullName,
          })),
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return {
        envelopeId: envelope.id,
        resolvedSigners: resolvedSigners_,
        documentLabel: clientScoped.label,
        clientId: clientScoped.clientId,
      };
    },
  );
  return created;
}

/** Résolution des 3 canaux de signataires (dédup + jetons externes). */
async function resolveEnvelopeSigners(
  actor: SigndocActor,
  clientId: string,
  signers: Array<
    | { kind: "PORTAL_USER"; portalUserId: string }
    | { kind: "STAFF"; staffUserId: string }
    | { kind: "EXTERNAL"; email: string; fullName: string }
  >,
): Promise<ResolvedSigner[]> {
  const seenKeys = new Set<string>();
  const resolved: ResolvedSigner[] = [];
  for (const signer of signers) {
    if (signer.kind === "EXTERNAL") {
      const key = `email:${signer.email.toLowerCase()}`;
      if (seenKeys.has(key)) {
        throw new ValidationError(
          "Un même courriel ne peut figurer qu'une seule fois par enveloppe.",
        );
      }
      seenKeys.add(key);
      const token = randomBytes(32).toString("base64url");
      resolved.push({
        kind: "EXTERNAL",
        userId: null,
        email: signer.email,
        fullName: signer.fullName,
        token,
        tokenHash: hashSessionToken(token),
      });
      continue;
    }

    const userId =
      signer.kind === "PORTAL_USER" ? signer.portalUserId : signer.staffUserId;
    if (signer.kind === "PORTAL_USER") {
      const link = await withTenantContext(actor.tenantId, actor.userId, (tx) =>
        tx.clientPortalLink.findFirst({
          where: { clientId, userId, status: "ACTIVE" },
          select: { id: true },
        }),
      );
      if (!link) {
        throw new ValidationError(
          "Ce signataire n'a pas de lien portail actif sur ce dossier — envoyez-lui d'abord un code d'invitation.",
        );
      }
    } else {
      const membership = await withTenantContext(
        actor.tenantId,
        actor.userId,
        (tx) =>
          tx.tenantUser.findFirst({
            where: { tenantId: actor.tenantId, userId, status: "ACTIVE" },
            select: { id: true },
          }),
      );
      if (!membership) {
        throw new ValidationError(
          "Ce membre du cabinet est introuvable ou inactif.",
        );
      }
    }

    const user = await withSystemContext((tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      }),
    );
    if (!user) {
      throw new ValidationError("Compte du signataire introuvable.");
    }
    const key = `user:${userId}`;
    if (seenKeys.has(key)) {
      throw new ValidationError(
        "Un même signataire ne peut figurer qu'une seule fois par enveloppe.",
      );
    }
    seenKeys.add(key);
    resolved.push({
      kind: signer.kind,
      userId,
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`,
      token: null,
      tokenHash: null,
    });
  }
  return resolved;
}

// ═════════════════════════ LECTURES ═════════════════════════

/** Enveloppes d'une pièce (affichage conseiller) — expire les échues. */
export async function listDocumentEnvelopes(
  actor: SigndocActor,
  documentId: string,
) {
  requirePermission(actor.role, "documents:read");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const ids = await tx.documentSignature.findMany({
      where: { documentId },
      select: { id: true },
    });
    const expired = await tx.documentSignature.findMany({
      where: {
        id: { in: ids.map((row) => row.id) },
        status: { in: [...ACTIVE_ENVELOPE_STATUSES] },
        expiresAt: { lt: new Date() },
      },
      select: { id: true, requestedById: true },
    });
    for (const envelope of expired) {
      await tx.documentSignature.update({
        where: { id: envelope.id },
        data: { status: "EXPIRED", expiredAt: new Date() },
      });
      await signdocAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: envelope.requestedById,
        action: "documents.signature.envelope.expired",
        entityType: "DocumentSignature",
        entityId: envelope.id,
        newData: { documentId },
      });
    }
    const envelopes = await tx.documentSignature.findMany({
      where: { documentId },
      include: {
        signers: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            kind: true,
            userId: true,
            email: true,
            fullName: true,
            sortOrder: true,
            status: true,
            signerName: true,
            signedAt: true,
            declineReason: true,
            remindedAt: true,
          },
        },
        signedDocument: { select: { id: true } },
      },
      orderBy: { requestedAt: "desc" },
    });

    // Sprint 7c — puces cliquables : dossier client derrière chaque
    // signataire portail (lien certifié conseiller ↔ profil client).
    const portalUserIds = [
      ...new Set(
        envelopes.flatMap((envelope) =>
          envelope.signers
            .filter(
              (signer) => signer.kind === "PORTAL_USER" && signer.userId,
            )
            .map((signer) => signer.userId!),
        ),
      ),
    ];
    const portalLinks =
      portalUserIds.length === 0
        ? []
        : await tx.clientPortalLink.findMany({
            where: { userId: { in: portalUserIds }, status: "ACTIVE" },
            select: { userId: true, clientId: true },
          });
    const clientIdByUserId = new Map(
      portalLinks.map((link) => [link.userId, link.clientId] as const),
    );

    return envelopes.map((envelope) => ({
      ...envelope,
      signers: envelope.signers.map((signer) => ({
        ...signer,
        clientId:
          signer.kind === "PORTAL_USER" && signer.userId
            ? (clientIdByUserId.get(signer.userId) ?? null)
            : null,
        isMe: signer.kind === "STAFF" && signer.userId === actor.userId,
      })),
    }));
  });
}

export interface PortalPendingSignature {
  signerId: string;
  envelopeId: string;
  envelopeStatus: "REQUESTED" | "PARTIALLY_SIGNED";
  signingMode: "SEQUENTIAL" | "PARALLEL";
  message: string | null;
  expiresAt: Date | null;
  requestedAt: Date;
  requestedByName: string;
  myTurn: boolean;
  myFields: Array<{ kind: "SIGNATURE" | "INITIALS" | "DATE"; pageIndex: number }>;
  hasInitialsFields: boolean;
  cosigners: Array<{ fullName: string; status: string }>;
  document: {
    id: string;
    label: string;
    category: string;
    sizeBytes: number;
    mimeType: string;
    createdAt: Date;
  };
}

/** Enveloppes où le particulier connecté a une ligne signataire PENDING. */
export async function listPendingPortalSignatures(
  portalUserId: string,
): Promise<PortalPendingSignature[]> {
  const link = await withSystemContext(async (tx) =>
    tx.clientPortalLink.findFirst({
      where: { userId: portalUserId, status: "ACTIVE" },
      select: { tenantId: true, clientId: true },
    }),
  );
  if (!link) return [];

  const rows = await withTenantContext(link.tenantId, portalUserId, (tx) =>
    tx.signatureSigner.findMany({
      where: { userId: portalUserId, kind: "PORTAL_USER", status: "PENDING" },
      select: {
        id: true,
        sortOrder: true,
        signatureId: true,
        signature: {
          select: {
            id: true,
            status: true,
            signingMode: true,
            message: true,
            expiresAt: true,
            requestedAt: true,
            requestedById: true,
            document: {
              select: {
                id: true,
                label: true,
                category: true,
                sizeBytes: true,
                mimeType: true,
                createdAt: true,
                status: true,
              },
            },
            signers: {
              orderBy: { sortOrder: "asc" },
              select: { fullName: true, status: true, sortOrder: true },
            },
            fields: {
              select: { kind: true, pageIndex: true, signerId: true },
            },
          },
        },
      },
    }),
  );

  const requesterIds = [
    ...new Set(rows.map((row) => row.signature.requestedById)),
  ];
  const requesters = await withSystemContext(async (tx) =>
    requesterIds.length === 0
      ? []
      : tx.user.findMany({
          where: { id: { in: requesterIds } },
          select: { id: true, firstName: true, lastName: true },
        }),
  );
  const byId = new Map(requesters.map((row) => [row.id, row]));

  return rows
    .filter((row) => row.signature.document.status === "ACTIVE")
    .filter((row) =>
      (ACTIVE_ENVELOPE_STATUSES as readonly string[]).includes(
        row.signature.status,
      ),
    )
    .filter(
      (row) =>
        !row.signature.expiresAt ||
        row.signature.expiresAt.getTime() > Date.now(),
    )
    .map((row) => {
      const envelope = row.signature;
      const turn = currentTurnOrder(
        envelope.signers.map((signer) => ({
          sortOrder: signer.sortOrder,
          status: signer.status as SignerStatus,
        })),
      );
      const myTurn =
        envelope.signingMode === "PARALLEL" ||
        (turn !== null && row.sortOrder === turn);
      const requester = byId.get(envelope.requestedById);
      const myFields = envelope.fields
        .filter((field) => field.signerId === row.id)
        .map((field) => ({ kind: field.kind, pageIndex: field.pageIndex }));
      return {
        signerId: row.id,
        envelopeId: envelope.id,
        envelopeStatus: envelope.status as "REQUESTED" | "PARTIALLY_SIGNED",
        signingMode: envelope.signingMode,
        message: envelope.message,
        expiresAt: envelope.expiresAt,
        requestedAt: envelope.requestedAt,
        requestedByName: requester
          ? `${requester.firstName} ${requester.lastName}`
          : "Votre conseiller",
        myTurn,
        myFields,
        hasInitialsFields: myFields.some((field) => field.kind === "INITIALS"),
        cosigners: envelope.signers.map((signer) => ({
          fullName: signer.fullName,
          status: signer.status as string,
        })),
        document: envelope.document,
      };
    });
}

// ═════════════ PRÉCONDITIONS COMMUNES (lecture système) ═════════

interface PendingSignerResolution {
  envelopeId: string;
  tenantId: string;
  clientId: string;
  documentId: string;
  signer: SignerLite;
}

/**
 * Vérifie en contexte système que la ligne signataire est bien ouverte
 * à l'action (enveloppe active, ligne PENDING, tour séquentiel). La RLS
 * réapplique ces gardes lors de l'UPDATE — défense en profondeur.
 */
async function resolvePendingSigner(
  signerId: string,
): Promise<PendingSignerResolution> {
  return withSystemContext(async (tx) => {
    const signer = await tx.signatureSigner.findFirst({
      where: { id: signerId },
    });
    if (!signer) {
      throw new ValidationError("Cette ligne de signature est introuvable.");
    }
    const envelope = await tx.documentSignature.findFirst({
      where: { id: signer.signatureId },
    });
    if (!envelope) {
      throw new ValidationError("Cette enveloppe est introuvable.");
    }
    if (!isEnvelopeLive(envelope)) {
      throw new ValidationError(
        "Cette enveloppe n'est plus ouverte (signée, refusée, expirée ou annulée ?).",
      );
    }
    if (signer.status !== "PENDING") {
      throw new ValidationError("Vous avez déjà répondu à cette demande.");
    }
    const document = await tx.document.findFirst({
      where: { id: envelope.documentId, status: "ACTIVE" },
      select: { id: true, clientId: true },
    });
    if (!document) {
      throw new ValidationError("La pièce à signer a été retirée du coffre.");
    }
    if (envelope.signingMode === "SEQUENTIAL") {
      const siblings = await tx.signatureSigner.findMany({
        where: { signatureId: envelope.id },
        select: { sortOrder: true, status: true },
      });
      const turn = currentTurnOrder(siblings);
      if (turn === null || signer.sortOrder !== turn) {
        throw new ValidationError(
          "Ce n'est pas encore votre tour de signer — un autre signataire doit compléter avant vous.",
        );
      }
    }
    return {
      envelopeId: envelope.id,
      tenantId: envelope.tenantId,
      clientId: document.clientId,
      documentId: document.id,
      signer: signer as PendingSignerResolution["signer"],
    };
  });
}

// ═════════ AGRÉGATION D'ENVELOPPE (contexte système) ═════════

type SettleOutcome = "completed" | "declined" | "partial";

/**
 * Produit la copie finale d'une enveloppe CLOSE (complétée OU close
 * sur refus) : original estampillé (vignettes + marqueurs de refus),
 * certificat fusionné, versement via le PORT puits, traçabilité.
 * Retourne { signedDocumentId, proofSha256 }.
 */
async function produceFinalCopy(params: {
  envelopeId: string;
  tenantId: string;
  requestedById: string;
  outcome: "SIGNED" | "DECLINED";
  signingMode: "SEQUENTIAL" | "PARALLEL";
  document: {
    id: string;
    clientId: string;
    label: string;
    category: string;
    storageKey: string;
    contentTag: string;
  };
  firmName: string;
  signers: Array<{
    id: string;
    kind: SignerLite["kind"];
    email: string;
    fullName: string;
    status: SignerStatus;
    signerName: string | null;
    initialsText: string | null;
    signatureStyle: string | null;
    signedAt: Date | null;
    drawnPng: Uint8Array | null;
    declineReason: string | null;
    declinedAt: Date | null;
    ipAddress: string | null;
    userAgent: string | null;
    consentText: string | null;
  }>;
  fields: Array<{
    signerId: string;
    kind: "SIGNATURE" | "INITIALS" | "DATE";
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}): Promise<{ signedDocumentId: string | null; proofSha256: string }> {
  const { envelopeId, document, signers, fields } = params;
  const originalBytes = await signdocReadObject(
    document.storageKey,
    document.contentTag,
  );

  const settledAt = new Date();
  const stampSigners = signers
    .filter((signer) => signer.status !== "PENDING")
    .map((signer) => ({
      index: signers.indexOf(signer),
      signerId: signer.id,
      typedName: signer.signerName ?? signer.fullName,
      initials:
        signer.initialsText ??
        deriveInitials(signer.signerName ?? signer.fullName),
      styleId: signer.signatureStyle,
      status: signer.status as "SIGNED" | "DECLINED",
      signedAt: signer.signedAt,
      declinedAt: signer.declinedAt,
      drawnPng: signer.drawnPng,
    }));
  const signerIndexById = new Map(
    signers.map((signer, index) => [signer.id, index] as const),
  );

  const stampedBytes = await stampSignatureFields(
    originalBytes,
    stampSigners,
    fields.map((field) => ({
      signerIndex: signerIndexById.get(field.signerId) ?? 0,
      kind: field.kind,
      pageIndex: field.pageIndex,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    })),
    { envelopeId },
  );

  const certificateBytes = await buildCertificatePdf({
    envelopeId,
    documentLabel: document.label,
    documentId: document.id,
    originalSha256: sha256Hex(originalBytes),
    firmName: params.firmName,
    signingMode: params.signingMode,
    outcome: params.outcome,
    signers: signers
      .filter((signer) => signer.status !== "PENDING")
      .map((signer) => ({
        fullName: signer.fullName,
        signerName: signer.signerName ?? signer.fullName,
        kind: signer.kind,
        email: signer.email,
        signedAt:
          (signer.status === "DECLINED" ? signer.declinedAt : signer.signedAt) ??
          settledAt,
        outcome: signer.status as "SIGNED" | "DECLINED",
        declineReason: signer.declineReason ?? undefined,
        signatureStyle: signer.signatureStyle ?? undefined,
        ipAddress: signer.ipAddress ?? undefined,
        userAgent: signer.userAgent ?? undefined,
        consentText: signer.consentText ?? SIGNATURE_CONSENT_TEXT,
        drawn: signer.drawnPng !== null,
      })),
  });

  const finalBytes = await mergeWithCertificate(stampedBytes, certificateBytes);
  const proofSha256 = sha256Hex(finalBytes);

  // Libellé SANS statut incrusté (retour d'équipe 7b) : suffixe hérité
  // « — à signer » nettoyé, jamais de « — signé » incrusté.
  const cleanLabel = document.label.endsWith(LEGACY_TO_SIGN_SUFFIX)
    ? document.label.slice(0, -LEGACY_TO_SIGN_SUFFIX.length)
    : document.label;

  const receipt = await signdocDepositSignedCopy({
    tenantId: params.tenantId,
    clientId: document.clientId,
    requestedById: params.requestedById,
    category: document.category,
    label: cleanLabel,
    bytes: finalBytes,
    sha256: proofSha256,
    envelopeId,
    autoShareToPortal: true,
  });

  return { signedDocumentId: receipt.documentId, proofSha256 };
}

/**
 * Relit l'enveloppe COMPLÈTE et applique la transition d'état :
 * refus → DECLINED (+ copie constatante téléchargeable ET avis) ;
 * tous signés → SIGNED (+ copie certifiée) ; sinon PARTIALLY_SIGNED
 * (+ avis au prochain tour séquentiel).
 */
async function settleEnvelope(
  envelopeId: string,
  trigger: { userId: string | null; kind: SignerLite["kind"] },
  meta: RequestMeta,
): Promise<SettleOutcome> {
  const snapshot = await withSystemContext(async (tx) => {
    const envelope = await tx.documentSignature.findFirst({
      where: { id: envelopeId, status: { in: [...ACTIVE_ENVELOPE_STATUSES] } },
    });
    if (!envelope) return null; // déjà réglée (double appel) — idempotent
    const [signers, fields, document, firm] = await Promise.all([
      tx.signatureSigner.findMany({
        where: { signatureId: envelopeId },
        orderBy: { sortOrder: "asc" },
      }),
      tx.signatureField.findMany({ where: { signatureId: envelopeId } }),
      tx.document.findFirst({ where: { id: envelope.documentId } }),
      tx.tenant.findUnique({
        where: { id: envelope.tenantId },
        select: { name: true },
      }),
    ]);
    const client = await tx.client.findFirst({
      where: { id: document?.clientId ?? "" },
      select: { firstName: true, lastName: true },
    });
    return { envelope, signers, fields, document, firm, client };
  });
  if (!snapshot) return "partial";
  const { envelope, signers, fields, document, firm, client } = snapshot;
  if (!document) {
    throw new ValidationError("La pièce à signer a été retirée du coffre.");
  }
  const clientName = client
    ? `${client.firstName} ${client.lastName}`
    : "Client";

  // ── 1. Refus → enveloppe DECLINED + COPIE CONSTATANTE ──
  const declined = signers.find((signer) => signer.status === "DECLINED");
  if (declined) {
    const finalCopy = await produceFinalCopy({
      envelopeId,
      tenantId: envelope.tenantId,
      requestedById: envelope.requestedById,
      outcome: "DECLINED",
      signingMode: envelope.signingMode,
      document,
      firmName: firm?.name ?? "Cabinet",
      signers: signers.map((signer) => ({
        id: signer.id,
        kind: signer.kind,
        email: signer.email,
        fullName: signer.fullName,
        status: signer.status,
        signerName: signer.signerName,
        initialsText: signer.initialsText,
        signatureStyle: signer.signatureStyle,
        signedAt: signer.signedAt,
        drawnPng: signer.drawnPng,
        declineReason: signer.declineReason,
        declinedAt: signer.declinedAt,
        ipAddress: signer.ipAddress,
        userAgent: signer.userAgent,
        consentText: signer.consentText,
      })),
      fields,
    });

    await withSystemContext(async (tx) => {
      await tx.documentSignature.update({
        where: { id: envelopeId },
        data: {
          status: "DECLINED",
          declinedAt: new Date(),
          signedDocumentId: finalCopy.signedDocumentId,
          proofSha256: finalCopy.proofSha256,
        },
      });
      await signdocTimeline(tx, envelope.tenantId, {
        clientId: document.clientId,
        eventType: "DOCUMENT",
        title: `Signature refusée : ${document.label}`,
        description: `${declined.fullName} a refusé de signer — motif consigné au registre ; copie constatant le refus versée au coffre.`,
        source: "SYSTEM",
        createdBy: trigger.userId ?? envelope.requestedById,
      });
      await signdocAudit(tx, {
        tenantId: envelope.tenantId,
        actorUserId: trigger.userId ?? envelope.requestedById,
        action: "documents.signature.envelope.declined",
        entityType: "DocumentSignature",
        entityId: envelopeId,
        newData: {
          documentId: envelope.documentId,
          declinedBy: declined.fullName,
          channel: declined.kind,
          reason: declined.declineReason,
          signedDocumentId: finalCopy.signedDocumentId,
          proofSha256: finalCopy.proofSha256,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
    try {
      const requester = await withSystemContext((tx) =>
        tx.user.findUnique({
          where: { id: envelope.requestedById },
          select: { email: true, firstName: true },
        }),
      );
      if (requester) {
        await signdocMail({
          to: requester.email,
          subject: `Signature refusée : ${document.label}`,
          text: [
            `Bonjour ${requester.firstName},`,
            "",
            `${declined.fullName} a refusé de signer « ${document.label} ».`,
            `Motif : ${declined.declineReason ?? "(non précisé)"}`,
            "",
            "La ronde est close : la copie constatant le refus (avec certificat) est au coffre et téléchargeable par les parties.",
            "Après discussion avec vos clients, utilisez « Nouvel envoi » pour repartir la même enveloppe en un clic.",
            "",
            "— CoAdvisor (TwoDots.ca)",
          ].join("\n"),
        });
      }
    } catch {
      // best-effort
    }
    return "declined";
  }

  // ── 2. Des signataires restent → PARTIALLY_SIGNED ──
  if (signers.some((signer) => signer.status !== "SIGNED")) {
    await withSystemContext(async (tx) => {
      await tx.documentSignature.update({
        where: { id: envelopeId },
        data: { status: "PARTIALLY_SIGNED" },
      });
    });
    if (envelope.signingMode === "SEQUENTIAL") {
      const turn = currentTurnOrder(signers);
      const next = signers.find(
        (signer) => signer.status === "PENDING" && signer.sortOrder === turn,
      );
      if (next) {
        await notifySigner({
          signer: next,
          documentLabel: document.label,
          clientName,
          message: envelope.message,
          turn: "next",
        });
      }
    }
    return "partial";
  }

  // ── 3. Tous signés → COPIE CERTIFIÉE ──
  const finalCopy = await produceFinalCopy({
    envelopeId,
    tenantId: envelope.tenantId,
    requestedById: envelope.requestedById,
    outcome: "SIGNED",
    signingMode: envelope.signingMode,
    document,
    firmName: firm?.name ?? "Cabinet",
    signers: signers.map((signer) => ({
      id: signer.id,
      kind: signer.kind,
      email: signer.email,
      fullName: signer.fullName,
      status: signer.status,
      signerName: signer.signerName,
      initialsText: signer.initialsText,
      signatureStyle: signer.signatureStyle,
      signedAt: signer.signedAt,
      drawnPng: signer.drawnPng,
      declineReason: signer.declineReason,
      declinedAt: signer.declinedAt,
      ipAddress: signer.ipAddress,
      userAgent: signer.userAgent,
      consentText: signer.consentText,
    })),
    fields,
  });

  const completedAt = new Date();
  await withSystemContext(async (tx) => {
    await tx.documentSignature.update({
      where: { id: envelopeId },
      data: {
        status: "SIGNED",
        signedAt: completedAt,
        proofSha256: finalCopy.proofSha256,
        signedDocumentId: finalCopy.signedDocumentId,
      },
    });

    await signdocTimeline(tx, envelope.tenantId, {
      clientId: document.clientId,
      eventType: "DOCUMENT",
      title: `Document signé par toutes les parties : ${document.label}`,
      description: `${signers.length} signataire(s) — copie certifiée déposée au coffre.`,
      source: "SYSTEM",
      createdBy: trigger.userId ?? envelope.requestedById,
    });

    await signdocAudit(tx, {
      tenantId: envelope.tenantId,
      actorUserId: trigger.userId ?? envelope.requestedById,
      action: "documents.signature.envelope.completed",
      entityType: "DocumentSignature",
      entityId: envelopeId,
      newData: {
        documentId: envelope.documentId,
        signedDocumentId: finalCopy.signedDocumentId,
        proofSha256: finalCopy.proofSha256,
        signers: signers.map((signer) => signer.fullName),
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  await Promise.allSettled(
    signers.map((signer) =>
      signdocMail({
        to: signer.email,
        subject: `Document signé par toutes les parties : ${document.label}`,
        text: [
          `Bonjour ${signer.fullName},`,
          "",
          `Le document « ${document.label} » a été signé par toutes les parties prévues.`,
          "Le PDF final (avec certificat de preuve) est téléchargeable depuis votre espace signature ; une copie est conservée au coffre sécurisé du cabinet.",
          "",
          "— CoAdvisor (TwoDots.ca)",
        ].join("\n"),
      }),
    ),
  );

  return "completed";
}

// ═════════════ DÉPÔT DE PREUVES (saisie utilisateur) ═════════════

interface SignerProofDeposit {
  signerName: string;
  initials: string;
  signatureStyle: string;
  drawnPng: Uint8Array | null;
}

function parseSignatureInput(rawInput: unknown): SignerProofDeposit {
  const input = parseOrThrow(signatureSubmitSchema, rawInput);
  let drawnPng: Uint8Array | null = null;
  if (input.drawnPngDataUrl) {
    const match = /^data:image\/png;base64,(.+)$/.exec(input.drawnPngDataUrl);
    if (!match?.[1]) {
      throw new ValidationError(
        "La signature tracée doit être un PNG encadré (data URL).",
      );
    }
    drawnPng = new Uint8Array(Buffer.from(match[1], "base64"));
    if (drawnPng.length === 0 || drawnPng.length > 300_000) {
      throw new ValidationError(
        "La signature tracée est vide ou trop lourde — recommencez.",
      );
    }
  }
  const { style } = resolveSignatureStyle(input.signatureStyle ?? null);
  return {
    signerName: input.signerName,
    initials: input.initials ?? deriveInitials(input.signerName),
    signatureStyle: style.id,
    drawnPng,
  };
}

function signedUpdateData(
  deposit: SignerProofDeposit,
  meta: RequestMeta,
): Record<string, unknown> {
  return {
    status: "SIGNED",
    signerName: deposit.signerName,
    initialsText: deposit.initials,
    signatureStyle: deposit.signatureStyle,
    drawnPng: deposit.drawnPng,
    signedAt: new Date(),
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
    consentText: SIGNATURE_CONSENT_TEXT,
  };
}

// __SIGNDOC_PART2__

// ═════════════ SIGNATURE / REFUS — CANAL PORTAIL ═════════════

export async function signAsPortalUser(
  portalUserId: string,
  signerId: string,
  rawInput: unknown,
  meta: RequestMeta = {},
) {
  const deposit = parseSignatureInput(rawInput);
  const pending = await resolvePendingSigner(signerId);
  if (
    pending.signer.kind !== "PORTAL_USER" ||
    pending.signer.userId !== portalUserId
  ) {
    throw new ValidationError("Cette demande ne vous est pas destinée.");
  }
  await withSystemContext(async (tx) => {
    const link = await tx.clientPortalLink.findFirst({
      where: {
        userId: portalUserId,
        status: "ACTIVE",
        clientId: pending.clientId,
      },
      select: { id: true },
    });
    if (!link) {
      throw new ValidationError(
        "Votre lien portail avec ce dossier n'est plus actif — contactez votre conseiller.",
      );
    }
  });

  // Transition sous la RLS signataire (portal_sign — les preuves sont
  // exigées par le WITH CHECK ; le tour est revérifié par la fonction
  // SECURITY DEFINER de la politique).
  await withTenantContext(pending.tenantId, portalUserId, async (tx) => {
    await tx.signatureSigner.update({
      where: { id: signerId },
      data: signedUpdateData(deposit, meta),
    });
    await signdocAudit(tx, {
      tenantId: pending.tenantId,
      actorUserId: portalUserId,
      action: "documents.signature.signer.signed",
      entityType: "SignatureSigner",
      entityId: signerId,
      newData: {
        envelopeId: pending.envelopeId,
        via: "portal",
        style: deposit.signatureStyle,
        drawn: deposit.drawnPng !== null,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return {
    outcome: await settleEnvelope(
      pending.envelopeId,
      { userId: portalUserId, kind: "PORTAL_USER" },
      meta,
    ),
  };
}

export async function declineAsPortalUser(
  portalUserId: string,
  signerId: string,
  rawInput: unknown,
  meta: RequestMeta = {},
) {
  const { reason } = parseOrThrow(signatureDeclineSchema, rawInput);
  const pending = await resolvePendingSigner(signerId);
  if (
    pending.signer.kind !== "PORTAL_USER" ||
    pending.signer.userId !== portalUserId
  ) {
    throw new ValidationError("Cette demande ne vous est pas destinée.");
  }

  await withTenantContext(pending.tenantId, portalUserId, async (tx) => {
    await tx.signatureSigner.update({
      where: { id: signerId },
      data: {
        status: "DECLINED",
        declineReason: reason,
        declinedAt: new Date(),
      },
    });
    await signdocAudit(tx, {
      tenantId: pending.tenantId,
      actorUserId: portalUserId,
      action: "documents.signature.signer.declined",
      entityType: "SignatureSigner",
      entityId: signerId,
      newData: { envelopeId: pending.envelopeId, via: "portal", reason },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return {
    outcome: await settleEnvelope(
      pending.envelopeId,
      { userId: portalUserId, kind: "PORTAL_USER" },
      meta,
    ),
  };
}

// ═════════════ SIGNATURE / REFUS — CANAL CABINET ═════════════

export async function signAsStaff(
  actor: SigndocActor,
  signerId: string,
  rawInput: unknown,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  const deposit = parseSignatureInput(rawInput);
  const pending = await resolvePendingSigner(signerId);
  if (
    pending.signer.kind !== "STAFF" ||
    pending.signer.userId !== actor.userId ||
    pending.tenantId !== actor.tenantId
  ) {
    throw new ValidationError("Cette contre-signature n'est pas à votre nom.");
  }

  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await tx.signatureSigner.update({
      where: { id: signerId },
      data: signedUpdateData(deposit, meta),
    });
    await signdocAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "documents.signature.signer.signed",
      entityType: "SignatureSigner",
      entityId: signerId,
      newData: {
        envelopeId: pending.envelopeId,
        via: "cabinet",
        style: deposit.signatureStyle,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return {
    outcome: await settleEnvelope(
      pending.envelopeId,
      { userId: actor.userId, kind: "STAFF" },
      meta,
    ),
  };
}

export async function declineAsStaff(
  actor: SigndocActor,
  signerId: string,
  rawInput: unknown,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  const { reason } = parseOrThrow(signatureDeclineSchema, rawInput);
  const pending = await resolvePendingSigner(signerId);
  if (
    pending.signer.kind !== "STAFF" ||
    pending.signer.userId !== actor.userId ||
    pending.tenantId !== actor.tenantId
  ) {
    throw new ValidationError("Cette ligne n'est pas à votre nom.");
  }

  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await tx.signatureSigner.update({
      where: { id: signerId },
      data: {
        status: "DECLINED",
        declineReason: reason,
        declinedAt: new Date(),
      },
    });
    await signdocAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "documents.signature.signer.declined",
      entityType: "SignatureSigner",
      entityId: signerId,
      newData: { envelopeId: pending.envelopeId, via: "cabinet", reason },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return {
    outcome: await settleEnvelope(
      pending.envelopeId,
      { userId: actor.userId, kind: "STAFF" },
      meta,
    ),
  };
}

// ═════════ SIGNATURE / REFUS — CANAL EXTERNE (jeton) ═════════

function assertTokenShape(rawToken: unknown): asserts rawToken is string {
  if (
    typeof rawToken !== "string" ||
    !/^[A-Za-z0-9_-]{20,90}$/.test(rawToken)
  ) {
    throw new ValidationError("Ce lien de signature est invalide.");
  }
}

async function resolveExternalSignerId(tokenHash: string): Promise<string> {
  const signer = await withSystemContext((tx) =>
    tx.signatureSigner.findFirst({
      where: { tokenHash, kind: "EXTERNAL" },
      orderBy: { signature: { requestedAt: "desc" } },
      select: { id: true },
    }),
  );
  if (!signer) {
    throw new ValidationError("Ce lien de signature est invalide ou expiré.");
  }
  return signer.id;
}

export async function signAsExternal(
  rawToken: unknown,
  rawInput: unknown,
  meta: RequestMeta = {},
) {
  assertTokenShape(rawToken);
  const deposit = parseSignatureInput(rawInput);
  const tokenHash = hashSessionToken(rawToken);

  const signerId = await resolveExternalSignerId(tokenHash);
  const pending = await resolvePendingSigner(signerId);
  if (pending.signer.kind !== "EXTERNAL") {
    throw new ValidationError("Ce lien de signature est invalide.");
  }

  // Transition sous la RLS externe (jeton en GUC + WITH CHECK preuves).
  await withSignatureTokenContext(tokenHash, async (tx) => {
    await tx.signatureSigner.update({
      where: { id: signerId },
      data: signedUpdateData(deposit, meta),
    });
  });

  // Audit en contexte système — aucun insert audit en contexte public.
  await withSystemContext((tx) =>
    signdocAudit(tx, {
      tenantId: pending.tenantId,
      actorUserId: null,
      action: "documents.signature.signer.signed",
      entityType: "SignatureSigner",
      entityId: signerId,
      newData: {
        envelopeId: pending.envelopeId,
        via: "external-link",
        email: pending.signer.email,
        style: deposit.signatureStyle,
        drawn: deposit.drawnPng !== null,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  );

  return {
    outcome: await settleEnvelope(
      pending.envelopeId,
      { userId: null, kind: "EXTERNAL" },
      meta,
    ),
  };
}

export async function declineAsExternal(
  rawToken: unknown,
  rawInput: unknown,
  meta: RequestMeta = {},
) {
  assertTokenShape(rawToken);
  const { reason } = parseOrThrow(signatureDeclineSchema, rawInput);
  const tokenHash = hashSessionToken(rawToken);

  const signerId = await resolveExternalSignerId(tokenHash);
  const pending = await resolvePendingSigner(signerId);
  if (pending.signer.kind !== "EXTERNAL") {
    throw new ValidationError("Ce lien de signature est invalide.");
  }

  await withSignatureTokenContext(tokenHash, async (tx) => {
    await tx.signatureSigner.update({
      where: { id: signerId },
      data: {
        status: "DECLINED",
        declineReason: reason,
        declinedAt: new Date(),
      },
    });
  });

  await withSystemContext((tx) =>
    signdocAudit(tx, {
      tenantId: pending.tenantId,
      actorUserId: null,
      action: "documents.signature.signer.declined",
      entityType: "SignatureSigner",
      entityId: signerId,
      newData: {
        envelopeId: pending.envelopeId,
        via: "external-link",
        email: pending.signer.email,
        reason,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  );

  return {
    outcome: await settleEnvelope(
      pending.envelopeId,
      { userId: null, kind: "EXTERNAL" },
      meta,
    ),
  };
}

// ═════════════ ANNULATION / RELANCES / BALAYAGE ═════════════

/** Annulation (conseiller) d'une enveloppe ouverte. */
export async function cancelEnvelope(
  actor: SigndocActor,
  envelopeId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const envelope = await tx.documentSignature.findFirst({
      where: { id: envelopeId, status: { in: [...ACTIVE_ENVELOPE_STATUSES] } },
      include: { document: { select: { clientId: true, label: true } } },
    });
    if (!envelope) {
      throw new ValidationError("Cette enveloppe est introuvable (déjà close ?).");
    }
    const updated = await tx.documentSignature.update({
      where: { id: envelopeId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await signdocTimeline(tx, actor.tenantId, {
      clientId: envelope.document.clientId,
      eventType: "DOCUMENT",
      title: `Enveloppe de signature annulée : ${envelope.document.label}`,
      source: "SYSTEM",
      createdBy: actor.userId,
    });
    await signdocAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "documents.signature.envelope.cancelled",
      entityType: "DocumentSignature",
      entityId: envelopeId,
      newData: { documentId: envelope.documentId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return updated;
  });
}

/** Relance manuelle — courriel aux signataires du tour courant (4 h min). */
export async function sendEnvelopeReminder(
  actor: SigndocActor,
  envelopeId: string,
  meta: RequestMeta = {},
): Promise<{ reminded: number }> {
  requirePermission(actor.role, "documents:write");

  const prepared = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const envelope = await tx.documentSignature.findFirst({
        where: { id: envelopeId, status: { in: [...ACTIVE_ENVELOPE_STATUSES] } },
        include: { document: { select: { label: true, clientId: true } } },
      });
      if (!envelope) {
        throw new ValidationError("Cette enveloppe n'est plus ouverte.");
      }
      if (
        envelope.lastReminderAt &&
        Date.now() - envelope.lastReminderAt.getTime() < 4 * 60 * 60 * 1000
      ) {
        throw new ValidationError(
          "Une relance a déjà été envoyée il y a moins de 4 heures — laissez respirer vos signataires.",
        );
      }
      const signers = await tx.signatureSigner.findMany({
        where: { signatureId: envelopeId },
        orderBy: { sortOrder: "asc" },
      });
      const targets =
        envelope.signingMode === "PARALLEL"
          ? signers.filter((signer) => signer.status === "PENDING")
          : signers.filter(
              (signer) =>
                signer.status === "PENDING" &&
                signer.sortOrder === currentTurnOrder(signers),
            );
      if (targets.length === 0) {
        throw new ValidationError("Aucun signataire en attente à relancer.");
      }
      const client = await tx.client.findFirst({
        where: { id: envelope.document.clientId },
        select: { firstName: true, lastName: true },
      });
      return { envelope, targets, client };
    },
  );

  const clientName = prepared.client
    ? `${prepared.client.firstName} ${prepared.client.lastName}`
    : "Client";
  for (const target of prepared.targets) {
    await notifySigner({
      signer: target,
      documentLabel: prepared.envelope.document.label,
      clientName,
      message: prepared.envelope.message,
      turn: "reminder",
    });
  }

  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await tx.documentSignature.update({
      where: { id: envelopeId },
      data: {
        lastReminderAt: new Date(),
        reminderCount: { increment: 1 },
      },
    });
    await tx.signatureSigner.updateMany({
      where: { id: { in: prepared.targets.map((target) => target.id) } },
      data: { remindedAt: new Date() },
    });
    await signdocAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "documents.signature.envelope.reminded",
      entityType: "DocumentSignature",
      entityId: envelopeId,
      newData: {
        recipients: prepared.targets.map((target) => target.email),
        manual: true,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return { reminded: prepared.targets.length };
}

/**
 * Balayage automatique — invoqué au chargement des écrans conseiller :
 * (1) règle les enveloppes EXPIRED ; (2) envoie les relances dues
 * (cadence SIGNATURE_REMINDER_INTERVAL_HOURS). Jamais bloquant.
 */
export async function sweepSignatureEnvelopes(
  actor: SigndocActor,
): Promise<{ expired: number; reminded: number }> {
  requirePermission(actor.role, "documents:read");
  let expired = 0;
  let reminded = 0;

  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const stale = await tx.documentSignature.findMany({
      where: {
        status: { in: [...ACTIVE_ENVELOPE_STATUSES] },
        expiresAt: { lt: new Date() },
      },
      select: { id: true, requestedById: true, documentId: true },
    });
    for (const envelope of stale) {
      await tx.documentSignature.update({
        where: { id: envelope.id },
        data: { status: "EXPIRED", expiredAt: new Date() },
      });
      await signdocAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: envelope.requestedById,
        action: "documents.signature.envelope.expired",
        entityType: "DocumentSignature",
        entityId: envelope.id,
        newData: { documentId: envelope.documentId, via: "sweep" },
      });
      expired += 1;
    }

    const intervalMs = SIGNATURE_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000;
    const due = await tx.documentSignature.findMany({
      where: {
        status: { in: [...ACTIVE_ENVELOPE_STATUSES] },
        OR: [
          {
            lastReminderAt: null,
            requestedAt: { lt: new Date(Date.now() - intervalMs) },
          },
          { lastReminderAt: { lt: new Date(Date.now() - intervalMs) } },
        ],
      },
      include: {
        signers: { orderBy: { sortOrder: "asc" } },
        document: { select: { label: true, clientId: true } },
      },
    });

    for (const envelope of due) {
      const targets =
        envelope.signingMode === "PARALLEL"
          ? envelope.signers.filter((signer) => signer.status === "PENDING")
          : envelope.signers.filter(
              (signer) =>
                signer.status === "PENDING" &&
                signer.sortOrder ===
                  currentTurnOrder(
                    envelope.signers.map((signer) => ({
                      sortOrder: signer.sortOrder,
                      status: signer.status as SignerStatus,
                    })),
                  ),
            );
      if (targets.length === 0) continue;
      const client = await tx.client.findFirst({
        where: { id: envelope.document.clientId },
        select: { firstName: true, lastName: true },
      });
      const clientName = client
        ? `${client.firstName} ${client.lastName}`
        : "Client";
      for (const target of targets) {
        await notifySigner({
          signer: target,
          documentLabel: envelope.document.label,
          clientName,
          message: envelope.message,
          turn: "reminder",
        });
      }
      await tx.documentSignature.update({
        where: { id: envelope.id },
        data: {
          lastReminderAt: new Date(),
          reminderCount: { increment: 1 },
        },
      });
      await tx.signatureSigner.updateMany({
        where: { id: { in: targets.map((target) => target.id) } },
        data: { remindedAt: new Date() },
      });
      await signdocAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: envelope.requestedById,
        action: "documents.signature.envelope.reminded",
        entityType: "DocumentSignature",
        entityId: envelope.id,
        newData: {
          recipients: targets.map((target) => target.email),
          manual: false,
        },
      });
      reminded += 1;
    }
  });

  return { expired, reminded };
}

// ═════════════ GABARITS ═════════════

export async function listSignatureTemplates(actor: SigndocActor) {
  requirePermission(actor.role, "documents:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.signatureTemplate.findMany({ orderBy: { createdAt: "desc" } }),
  );
}

export async function deleteSignatureTemplate(
  actor: SigndocActor,
  templateId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const template = await tx.signatureTemplate.findFirst({
      where: { id: templateId },
    });
    if (!template) {
      throw new ValidationError("Ce gabarit est introuvable.");
    }
    await tx.signatureTemplate.delete({ where: { id: templateId } });
    await signdocAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "documents.signature.template.deleted",
      entityType: "SignatureTemplate",
      entityId: templateId,
      newData: { name: template.name },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
}

// ═════════ « NOUVEL ENVOI » — CLONE D'UNE ENVELOPPE CLOSE ═════════

/**
 * Sprint 7c (correctif 1) : une ronde close (refusée, annulée ou
 * expirée) repart en UN CLIC — mêmes pièce, signataires (jetons
 * externes régénérés) et champs ; message et échéance ajustables.
 * La chaîne de traçabilité `resent_from_id` garde le fil complet.
 */
export async function resendEnvelope(
  actor: SigndocActor,
  sourceEnvelopeId: string,
  rawInput: unknown,
  meta: RequestMeta = {},
): Promise<{ envelopeId: string; externalLinks: ExternalInviteLink[] }> {
  requirePermission(actor.role, "documents:write");
  const input = parseOrThrow(envelopeResendSchema, rawInput ?? {});

  const source = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const envelope = await tx.documentSignature.findFirst({
        where: { id: sourceEnvelopeId },
        include: {
          signers: { orderBy: { sortOrder: "asc" } },
          fields: true,
          document: {
            select: {
              id: true,
              clientId: true,
              label: true,
              mimeType: true,
              status: true,
            },
          },
        },
      });
      if (!envelope) {
        throw new ValidationError("Cette enveloppe est introuvable.");
      }
      if (!["DECLINED", "CANCELLED", "EXPIRED"].includes(envelope.status)) {
        throw new ValidationError(
          "Seule une enveloppe close (refusée, annulée ou expirée) peut repartir par « nouvel envoi ».",
        );
      }
      ensureSignableDocument(envelope.document);
      return envelope;
    },
  );

  // Signataires : mêmes personnes — PORTAL/STAFF re-résolus (courriel
  // à jour), EXTERNAL avec jeton frais (l'ancien lien demeure mort).
  const presetSigners: ResolvedSigner[] = [];
  for (const signer of source.signers) {
    if (signer.kind === "EXTERNAL") {
      const token = randomBytes(32).toString("base64url");
      presetSigners.push({
        kind: "EXTERNAL",
        userId: null,
        email: signer.email,
        fullName: signer.fullName,
        token,
        tokenHash: hashSessionToken(token),
      });
    } else {
      const user = signer.userId
        ? await withSystemContext((tx) =>
            tx.user.findUnique({
              where: { id: signer.userId! },
              select: { email: true, firstName: true, lastName: true },
            }),
          )
        : null;
      presetSigners.push({
        kind: signer.kind,
        userId: signer.userId,
        email: user?.email ?? signer.email,
        fullName: user
          ? `${user.firstName} ${user.lastName}`
          : signer.fullName,
        token: null,
        tokenHash: null,
      });
    }
  }

  const expiresInDays =
    input.expiresInDays ??
    (source.expiresAt
      ? Math.max(
          1,
          Math.round(
            (source.expiresAt.getTime() - source.requestedAt.getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 14);

  const fields = source.fields.map((field) => ({
    signerIndex: source.signers.findIndex(
      (signer) => signer.id === field.signerId,
    ),
    kind: field.kind,
    pageIndex: field.pageIndex,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
  }));

  const created = await buildEnvelopeFromResolved(
    actor,
    source.documentId,
    {
      signers: [],
      signingMode: source.signingMode,
      message: input.message ?? source.message ?? undefined,
      expiresInDays,
      fields,
    },
    source.id,
    meta,
    presetSigners,
  );

  const client = await withSystemContext((tx) =>
    tx.client.findFirst({
      where: { id: created.clientId },
      select: { firstName: true, lastName: true },
    }),
  );
  const externalLinks = await notifyInitialTurn({
    signers: presetSigners,
    signingMode: source.signingMode,
    documentLabel: created.documentLabel,
    clientName: client ? `${client.firstName} ${client.lastName}` : "Client",
    message: input.message ?? source.message,
  });

  return { envelopeId: created.envelopeId, externalLinks };
}

// ═════════ CONSOLE CABINET (Sprint 7c — correctif 5) ═════════

export interface DeskSignerChip {
  fullName: string;
  kind: SignerLite["kind"];
  status: string;
  sortOrder: number;
  isMe: boolean;
}

export interface DeskEnvelopeRow {
  envelopeId: string;
  status: string;
  signingMode: "SEQUENTIAL" | "PARALLEL";
  message: string | null;
  requestedAt: Date;
  expiresAt: Date | null;
  /** Date de clôture (signée/refusée/annulée/expirée) pour l'historique. */
  terminalAt: Date | null;
  documentId: string;
  documentLabel: string;
  clientId: string;
  clientName: string;
  requestedByName: string;
  signers: DeskSignerChip[];
  signedDocumentId: string | null;
  resentFromId: string | null;
  /** Ma ligne de contre-signature en attente s'il y a lieu. */
  myPendingSignerId: string | null;
  myTurn: boolean;
}

export interface SignatureDesk {
  /** Mes contre-signatures à faire (je suis signataire STAFF). */
  myPending: DeskEnvelopeRow[];
  /** Toutes les enveloppes en circulation du cabinet. */
  inFlight: DeskEnvelopeRow[];
  /** Historique des rondes closes (50 plus récentes). */
  history: DeskEnvelopeRow[];
}

/**
 * « L'ensemble de toutes les signatures en circulation » du cabinet :
 * à signer par moi, en cours (suivi : relancer, annuler), historique
 * (télécharger la copie close, nouvel envoi).
 */
export async function listSignatureDesk(
  actor: SigndocActor,
): Promise<SignatureDesk> {
  requirePermission(actor.role, "documents:read");

  const rows = await withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.documentSignature.findMany({
      include: {
        document: {
          select: { id: true, label: true, clientId: true, status: true },
        },
        signers: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            kind: true,
            userId: true,
            fullName: true,
            sortOrder: true,
            status: true,
          },
        },
      },
      orderBy: { requestedAt: "desc" },
      take: 200,
    }),
  );

  // Noms (clients + demandeurs) — lectures système ciblées.
  const clientIds = [
    ...new Set(rows.map((row) => row.document.clientId).filter(Boolean)),
  ];
  const requesterIds = [...new Set(rows.map((row) => row.requestedById))];
  const clients: Array<{ id: string; firstName: string; lastName: string }> =
    clientIds.length === 0
      ? []
      : await withSystemContext((tx) =>
          tx.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, firstName: true, lastName: true },
          }),
        );
  const requesters: Array<{ id: string; firstName: string; lastName: string }> =
    requesterIds.length === 0
      ? []
      : await withSystemContext((tx) =>
          tx.user.findMany({
            where: { id: { in: requesterIds } },
            select: { id: true, firstName: true, lastName: true },
          }),
        );
  const clientNameById = new Map(
    clients.map((row) => [row.id, `${row.firstName} ${row.lastName}`] as const),
  );
  const requesterById = new Map(requesters.map((row) => [row.id, row]));

  const now = Date.now();
  const items: DeskEnvelopeRow[] = rows.map((row) => {
    const turn = currentTurnOrder(
      row.signers.map((signer) => ({
        sortOrder: signer.sortOrder,
        status: signer.status as SignerStatus,
      })),
    );
    const mySigner = row.signers.find(
      (signer) =>
        signer.kind === "STAFF" &&
        signer.userId === actor.userId &&
        signer.status === "PENDING",
    );
    const live =
      (ACTIVE_ENVELOPE_STATUSES as readonly string[]).includes(row.status) &&
      (!row.expiresAt || row.expiresAt.getTime() > now);
    const terminalAt =
      row.signedAt ?? row.declinedAt ?? row.cancelledAt ?? row.expiredAt;
    const requester = requesterById.get(row.requestedById);
    return {
      envelopeId: row.id,
      status: row.status,
      signingMode: row.signingMode,
      message: row.message,
      requestedAt: row.requestedAt,
      expiresAt: row.expiresAt,
      terminalAt,
      documentId: row.document.id,
      documentLabel: row.document.label,
      clientId: row.document.clientId,
      clientName:
        clientNameById.get(row.document.clientId) ?? "Dossier client",
      requestedByName: requester
        ? `${requester.firstName} ${requester.lastName}`
        : "Cabinet",
      signers: row.signers.map((signer) => ({
        fullName: signer.fullName,
        kind: signer.kind,
        status: signer.status as string,
        sortOrder: signer.sortOrder,
        isMe:
          signer.kind === "STAFF" && signer.userId === actor.userId,
      })),
      signedDocumentId: row.signedDocumentId,
      resentFromId: row.resentFromId,
      myPendingSignerId: mySigner?.id ?? null,
      myTurn:
        mySigner !== undefined &&
        live &&
        (row.signingMode === "PARALLEL" ||
          (turn !== null && mySigner.sortOrder === turn)),
    };
  });

  const inFlight = items.filter((item) =>
    (ACTIVE_ENVELOPE_STATUSES as readonly string[]).includes(item.status),
  );
  const history = items
    .filter(
      (item) =>
        !(ACTIVE_ENVELOPE_STATUSES as readonly string[]).includes(item.status),
    )
    .sort((a, b) => (b.terminalAt?.getTime() ?? 0) - (a.terminalAt?.getTime() ?? 0))
    .slice(0, 50);

  return {
    // « À signer par moi » : ma signature reste à apposer ET la ronde est
    // encore VIVANTE — une ronde close (annulée, refusée, signée, expirée)
    // laisse mes lignes de signataire PENDING en base (historique intact),
    // elles ne doivent donc pas reparaître dans ma file.
    myPending: items
      .filter(
        (item) =>
          item.myPendingSignerId !== null &&
          (ACTIVE_ENVELOPE_STATUSES as readonly string[]).includes(
            item.status,
          ) &&
          (item.expiresAt === null || item.expiresAt.getTime() > now),
      )
      .sort((a, b) => {
        if (a.myTurn !== b.myTurn) return a.myTurn ? -1 : 1;
        return a.requestedAt.getTime() - b.requestedAt.getTime();
      }),
    inFlight,
    history,
  };
}

// ═════ VUE DE SIGNATURE « DANS LE DOCUMENT » (Sprint 7c — 3) ═════

export interface SigningFieldView {
  kind: "SIGNATURE" | "INITIALS" | "DATE";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CosignerFieldView extends SigningFieldView {
  signerName: string;
  signerStatus: string;
  signerIndex: number;
}

export interface SigningView {
  signerId: string;
  envelopeId: string;
  /** OPEN (à moi), SIGNED (j'ai signé), DECLINED (j'ai refusé), CLOSED. */
  status: "OPEN" | "SIGNED" | "DECLINED" | "CLOSED";
  envelopeStatus: string;
  /** Copie finale (avec certificat) téléchargeable par les parties. */
  signedAvailable: boolean;
  declinedReason: string | null;
  myTurn: boolean;
  signingMode: "SEQUENTIAL" | "PARALLEL";
  message: string | null;
  expiresAt: Date | null;
  fullName: string;
  email: string;
  requestedByName: string;
  document: { id: string; label: string; mimeType: string; sizeBytes: number };
  myFields: SigningFieldView[];
  othersFields: CosignerFieldView[];
  hasInitialsFields: boolean;
  cosigners: Array<{ fullName: string; status: string }>;
}

/** Compatibilité Sprint 7b (nom historique de la vue publique). */
export type ExternalSigningView = SigningView;

function assembleSigningView(snapshot: {
  signer: {
    id: string;
    fullName: string;
    email: string;
    status: SignerStatus;
    sortOrder: number;
    declineReason: string | null;
  };
  envelope: {
    id: string;
    status: string;
    signingMode: "SEQUENTIAL" | "PARALLEL";
    message: string | null;
    expiresAt: Date | null;
    requestedById: string;
    signedDocumentId: string | null;
  };
  document: {
    id: string;
    label: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
  } | null;
  siblings: Array<{
    id: string;
    fullName: string;
    status: string;
    sortOrder: number;
  }>;
  fields: Array<{
    signerId: string;
    kind: "SIGNATURE" | "INITIALS" | "DATE";
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  requesterName: string;
}): SigningView {
  const { signer, envelope, document, siblings, fields, requesterName } =
    snapshot;
  const live = isEnvelopeLive(envelope);
  const turn = currentTurnOrder(
    siblings.map((sibling) => ({
      sortOrder: sibling.sortOrder,
      status: sibling.status as SignerStatus,
    })),
  );
  const myTurn =
    envelope.signingMode === "PARALLEL" ||
    (turn !== null && signer.sortOrder === turn);
  const indexById = new Map(
    siblings.map((sibling, index) => [sibling.id, index] as const),
  );
  const nameById = new Map(
    siblings.map((sibling) => [sibling.id, sibling] as const),
  );

  const myFields: SigningFieldView[] = fields
    .filter((field) => field.signerId === signer.id)
    .map((field) => ({
      kind: field.kind,
      pageIndex: field.pageIndex,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    }));
  const othersFields: CosignerFieldView[] = fields
    .filter((field) => field.signerId !== signer.id)
    .map((field) => {
      const owner = nameById.get(field.signerId);
      return {
        kind: field.kind,
        pageIndex: field.pageIndex,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        signerName: owner?.fullName ?? "Cosignataire",
        signerStatus: owner?.status ?? "PENDING",
        signerIndex: indexById.get(field.signerId) ?? 0,
      };
    });

  const status: SigningView["status"] =
    signer.status === "SIGNED"
      ? "SIGNED"
      : signer.status === "DECLINED"
        ? "DECLINED"
        : live
          ? "OPEN"
          : "CLOSED";

  return {
    signerId: signer.id,
    envelopeId: envelope.id,
    status,
    envelopeStatus: envelope.status,
    signedAvailable: envelope.signedDocumentId !== null,
    declinedReason: signer.declineReason,
    myTurn,
    signingMode: envelope.signingMode,
    message: envelope.message,
    expiresAt: envelope.expiresAt,
    fullName: signer.fullName,
    email: signer.email,
    requestedByName: requesterName,
    document: document
      ? {
          id: document.id,
          label: document.label,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
        }
      : { id: "", label: "(pièce retirée)", mimeType: "application/pdf", sizeBytes: 0 },
    myFields,
    othersFields,
    hasInitialsFields: myFields.some((field) => field.kind === "INITIALS"),
    cosigners: siblings
      .filter((sibling) => sibling.id !== signer.id)
      .map((sibling) => ({
        fullName: sibling.fullName,
        status: sibling.status,
      })),
  };
}

/** Lecture système partagée après validation de l'appartenance. */
async function readSigningSnapshot(signerId: string) {
  return withSystemContext(async (tx) => {
    const signer = await tx.signatureSigner.findFirst({
      where: { id: signerId },
    });
    if (!signer) return null;
    const envelope = await tx.documentSignature.findFirst({
      where: { id: signer.signatureId },
    });
    if (!envelope) return null;
    const [document, siblings, fields, requester] = await Promise.all([
      tx.document.findFirst({
        where: { id: envelope.documentId },
        select: {
          id: true,
          label: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
        },
      }),
      tx.signatureSigner.findMany({
        where: { signatureId: envelope.id },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          fullName: true,
          status: true,
          sortOrder: true,
        },
      }),
      tx.signatureField.findMany({
        where: { signatureId: envelope.id },
        select: {
          signerId: true,
          kind: true,
          pageIndex: true,
          x: true,
          y: true,
          width: true,
          height: true,
        },
      }),
      tx.user.findUnique({
        where: { id: envelope.requestedById },
        select: { firstName: true, lastName: true },
      }),
    ]);
    return {
      signer,
      envelope,
      document,
      siblings,
      fields,
      requesterName: requester
        ? `${requester.firstName} ${requester.lastName}`
        : "Le cabinet",
    };
  });
}

/** Vue publique d'un jeton externe (colonnes choisies — jamais la PII d'autrui). */
export async function resolveExternalSigning(
  rawToken: unknown,
): Promise<ExternalSigningView | null> {
  if (
    typeof rawToken !== "string" ||
    !/^[A-Za-z0-9_-]{20,90}$/.test(rawToken)
  ) {
    return null;
  }
  const tokenHash = hashSessionToken(rawToken);

  const signerId = await withSystemContext(async (tx) => {
    const signer = await tx.signatureSigner.findFirst({
      where: { tokenHash, kind: "EXTERNAL" },
      orderBy: { signature: { requestedAt: "desc" } },
      select: { id: true },
    });
    return signer?.id ?? null;
  });
  if (!signerId) return null;

  const snapshot = await readSigningSnapshot(signerId);
  if (!snapshot) return null;
  return assembleSigningView({
    signer: snapshot.signer,
    envelope: snapshot.envelope,
    document: snapshot.document,
    siblings: snapshot.siblings,
    fields: snapshot.fields,
    requesterName: snapshot.requesterName,
  });
}

/**
 * Vue « ouvrir et signer » du particulier (portail) : sa ligne lui
 * appartient (tout statut — relecture comprise) et le lien portail
 * du dossier est actif, puis lecture assemblée en système.
 */
export async function getPortalSigningView(
  portalUserId: string,
  signerId: string,
): Promise<SigningView | null> {
  const ownership = await withSystemContext(async (tx) => {
    const signer = await tx.signatureSigner.findFirst({
      where: { id: signerId, kind: "PORTAL_USER", userId: portalUserId },
      select: { id: true, signatureId: true },
    });
    if (!signer) return null;
    const envelope = await tx.documentSignature.findFirst({
      where: { id: signer.signatureId },
      select: { documentId: true },
    });
    if (!envelope) return null;
    const document = await tx.document.findFirst({
      where: { id: envelope.documentId },
      select: { clientId: true },
    });
    if (!document) return null;
    const link = await tx.clientPortalLink.findFirst({
      where: { userId: portalUserId, status: "ACTIVE", clientId: document.clientId },
      select: { id: true },
    });
    return link ? signer : null;
  });
  if (!ownership) return null;

  const snapshot = await readSigningSnapshot(signerId);
  if (!snapshot) return null;
  return assembleSigningView({
    signer: snapshot.signer,
    envelope: snapshot.envelope,
    document: snapshot.document,
    siblings: snapshot.siblings,
    fields: snapshot.fields,
    requesterName: snapshot.requesterName,
  });
}

/** Vue « ouvrir et signer » d'un membre du cabinet (contre-signature). */
export async function getStaffSigningView(
  actor: SigndocActor,
  signerId: string,
): Promise<SigningView | null> {
  requirePermission(actor.role, "documents:read");
  const ownership = await withSystemContext(async (tx) => {
    const signer = await tx.signatureSigner.findFirst({
      where: {
        id: signerId,
        kind: "STAFF",
        userId: actor.userId,
        tenantId: actor.tenantId,
      },
      select: { id: true },
    });
    return signer;
  });
  if (!ownership) return null;

  const snapshot = await readSigningSnapshot(signerId);
  if (!snapshot) return null;
  return assembleSigningView({
    signer: snapshot.signer,
    envelope: snapshot.envelope,
    document: snapshot.document,
    siblings: snapshot.siblings,
    fields: snapshot.fields,
    requesterName: snapshot.requesterName,
  });
}

// ═════════════ FLUX PDF (aperçu temps réel + copie finale) ═════════════

export interface SignerDocumentStream {
  document: { label: string; mimeType: string; sizeBytes: number };
  bytes: Uint8Array;
}

async function streamDocumentRow(
  row: {
    id: string;
    tenantId: string;
    label: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    contentTag: string;
  },
  audit: { actorUserId: string | null; via: string; ipAddress?: string | undefined; userAgent?: string | undefined },
): Promise<SignerDocumentStream> {
  const bytes = await signdocReadObject(row.storageKey, row.contentTag);
  await withSystemContext((tx) =>
    signdocAudit(tx, {
      tenantId: row.tenantId,
      actorUserId: audit.actorUserId,
      action: "documents.file.downloaded",
      entityType: "Document",
      entityId: row.id,
      newData: { via: audit.via, label: row.label },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }),
  );
  return {
    document: { label: row.label, mimeType: row.mimeType, sizeBytes: row.sizeBytes },
    bytes,
  };
}

/** Aperçu temps réel (positif « ce que je vais signer ») — portail. */
export async function streamPortalSignerDocument(
  portalUserId: string,
  signerId: string,
): Promise<SignerDocumentStream | null> {
  const view = await getPortalSigningView(portalUserId, signerId);
  if (!view || !view.document.id) return null;
  const row = await withSystemContext((tx) =>
    tx.document.findFirst({ where: { id: view.document.id } }),
  );
  if (!row) return null;
  return streamDocumentRow(row, { actorUserId: portalUserId, via: "portal-signature" });
}

/** Aperçu temps réel — cabinet (contre-signature). */
export async function streamStaffSignerDocument(
  actor: SigndocActor,
  signerId: string,
): Promise<SignerDocumentStream | null> {
  const view = await getStaffSigningView(actor, signerId);
  if (!view || !view.document.id) return null;
  const row = await withSystemContext((tx) =>
    tx.document.findFirst({ where: { id: view.document.id } }),
  );
  if (!row) return null;
  return streamDocumentRow(row, { actorUserId: actor.userId, via: "cabinet-signature" });
}

/** Copie finale (avec certificat) — téléchargeable par TOUTES les parties. */
export async function streamSignerFinalCopy(params: {
  envelopeId: string;
  channel: "portal" | "staff";
  userId: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}): Promise<SignerDocumentStream | null> {
  const row = await withSystemContext(async (tx) => {
    const signer = await tx.signatureSigner.findFirst({
      where: {
        signatureId: params.envelopeId,
        userId: params.userId,
        kind: params.channel === "portal" ? "PORTAL_USER" : "STAFF",
      },
      select: { id: true },
    });
    if (!signer) return null;
    const envelope = await tx.documentSignature.findFirst({
      where: {
        id: params.envelopeId,
        signedDocumentId: { not: null },
      },
      select: { signedDocumentId: true },
    });
    if (!envelope?.signedDocumentId) return null;
    return tx.document.findFirst({ where: { id: envelope.signedDocumentId } });
  });
  if (!row) return null;
  return streamDocumentRow(row, {
    actorUserId: params.userId,
    via: `${params.channel}-signature-final`,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}

/**
 * Flux PDF pour le signataire externe — ronde OUVERTE : pièce à
 * signer (RLS documents_public_signature borne en base) ; ronde
 * CLOSE : copie finale avec certificat (lecture système validée —
 * toutes les parties téléchargent).
 */
export async function streamExternalDocument(rawToken: unknown): Promise<{
  document: { label: string; mimeType: string; sizeBytes: number };
  bytes: Uint8Array;
} | null> {
  if (
    typeof rawToken !== "string" ||
    !/^[A-Za-z0-9_-]{20,90}$/.test(rawToken)
  ) {
    return null;
  }
  const tokenHash = hashSessionToken(rawToken);

  const documentRow = await withSignatureTokenContext(
    tokenHash,
    async (tx) => {
      const signer = await tx.signatureSigner.findFirst({
        where: { tokenHash, kind: "EXTERNAL" },
        orderBy: { signature: { requestedAt: "desc" } },
        select: { signatureId: true },
      });
      if (!signer) return null;
      const envelope = await tx.documentSignature.findFirst({
        where: {
          id: signer.signatureId,
          status: { in: [...ACTIVE_ENVELOPE_STATUSES] },
        },
        select: { documentId: true, signedDocumentId: true },
      });
      if (!envelope) return null;
      return tx.document.findFirst({
        where: { id: envelope.documentId, status: "ACTIVE" },
      });
    },
  );
  if (documentRow) {
    return streamDocumentRow(documentRow, {
      actorUserId: null,
      via: "external-signature",
    });
  }

  // Ronde close → copie finale (validation jeton hors RLS publique).
  const finalRow = await withSystemContext(async (tx) => {
    const signer = await tx.signatureSigner.findFirst({
      where: { tokenHash, kind: "EXTERNAL" },
      orderBy: { signature: { requestedAt: "desc" } },
      select: { signatureId: true },
    });
    if (!signer) return null;
    const envelope = await tx.documentSignature.findFirst({
      where: {
        id: signer.signatureId,
        signedDocumentId: { not: null },
      },
      select: { signedDocumentId: true },
    });
    if (!envelope?.signedDocumentId) return null;
    return tx.document.findFirst({ where: { id: envelope.signedDocumentId } });
  });
  if (!finalRow) return null;
  return streamDocumentRow(finalRow, {
    actorUserId: null,
    via: "external-signature-final",
  });
}
