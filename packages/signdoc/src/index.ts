/**
 * Signdoc — API publique (ADR-012).
 *
 * Ce point d'entrée EST le contrat du produit autonome : chaque
 * fonction correspond 1:1 à une opération REST future (mêmes
 * schémas zod d'entrée, mêmes erreurs ValidationError françaises).
 * Les dépendances externes au domaine sont injectées — câblez
 * `configureSigndocRuntime` AVANT tout appel (composition racine).
 */

export {
  configureSigndocRuntime,
  signdocRuntime,
  type CertBlock,
  type CertificateRenderInput,
  type SignedCopyDeposit,
  type SignedCopyReceipt,
  type SigndocAuditRecord,
  type SigndocMail,
  type SigndocRuntime,
  type SigndocTimelineEntry,
} from "./ports";

export {
  buildCertificateBlocks,
  buildCertificatePdf,
  buildSignedPdf,
  mergeWithCertificate,
  sha256Hex,
  SIGNED_DOC_VERSION,
  type CertificateSignerEntry,
  type EnvelopeCertInfo,
  type SignatureCertInfo,
} from "./cert-pdf";

export {
  deriveInitials,
  stampSignatureFields,
  STAMP_ENGINE_VERSION,
  type StampFieldPlacement,
  type StampSignerEntry,
} from "./stamp";

export {
  DEFAULT_SIGNATURE_STYLE_ID,
  isSignatureStyleId,
  readStyleFontBytes,
  resolveSignatureStyle,
  signatureStampId,
  SIGNATURE_STYLES,
  signdocFontContentType,
  signdocFontPublicName,
  type SignatureStyle,
} from "./styles";

export {
  envelopeCreateSchema,
  envelopeResendSchema,
  envelopeSignerSchema,
  signatureDeclineSchema,
  signatureFieldSchema,
  signatureSubmitSchema,
  signatureTemplateSaveSchema,
  typedNameSchema,
} from "./schemas";

export {
  cancelEnvelope,
  createEnvelope,
  declineAsExternal,
  declineAsPortalUser,
  declineAsStaff,
  deleteSignatureTemplate,
  getPortalSigningView,
  getStaffSigningView,
  listDocumentEnvelopes,
  listPendingPortalSignatures,
  listSignatureDesk,
  listSignatureTemplates,
  resendEnvelope,
  resolveExternalSigning,
  sendEnvelopeReminder,
  signAsExternal,
  signAsPortalUser,
  signAsStaff,
  streamExternalDocument,
  streamPortalSignerDocument,
  streamSignerFinalCopy,
  streamStaffSignerDocument,
  sweepSignatureEnvelopes,
  type CosignerFieldView,
  type DeskEnvelopeRow,
  type DeskSignerChip,
  type ExternalInviteLink,
  type ExternalSigningView,
  type PortalPendingSignature,
  type SignatureDesk,
  type SignerDocumentStream,
  type SigningFieldView,
  type SigningView,
} from "./service";

export type { RequestMeta, SigndocActor } from "./types";
