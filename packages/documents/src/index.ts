export {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  formatBytes,
  LEGACY_TO_SIGN_SUFFIX,
  MAX_SIGNERS_PER_ENVELOPE,
  MAX_UPLOAD_DISPLAY,
  SHARE_CHANNEL_LABELS,
  SIGNATURE_CONSENT_TEXT,
  SIGNATURE_FIELD_KIND_LABELS,
  SIGNATURE_REMINDER_INTERVAL_HOURS,
  SIGNATURE_STATUS_LABELS,
  SIGNER_KIND_LABELS,
  SIGNER_STATUS_LABELS,
  SIGNING_MODE_LABELS,
  type DocumentCategoryValue,
  type ShareChannelValue,
  type SignatureFieldKindValue,
  type SignatureStatusValue,
  type SignerKindValue,
  type SignerStatusValue,
  type SigningModeValue,
  type VaultDocumentSummary,
} from "./labels";

export type { DocumentsActor, RequestMeta } from "./actor";

export {
  StorageError,
  type ObjectStorage,
  type StoredObject,
  type StorageErrorReason,
} from "./storage/contract";
export { getObjectStorage, getStorageRoutingState } from "./storage/resolver";
export { gateUpload, MAX_UPLOAD_BYTES, sniffMagic } from "./mime";

export {
  listClientDocuments,
  prepareDocumentDownload,
  softDeleteDocument,
  splitHeader,
  uploadDocument,
  type UploadFileInput,
} from "./vault/service";

export {
  createLinkShare,
  hashShareToken,
  listDocumentShares,
  markPublicShareAccessed,
  resolvePublicShare,
  revokeShare,
  shareToPortal,
  SHARE_LINK_TTL_DAYS,
  type PublicShareView,
} from "./sharing/service";
export {
  listPortalSharedDocuments,
  preparePortalDocumentDownload,
  type PortalDocumentRow,
} from "./sharing/portal";

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
  type ExternalInviteLink,
  type ExternalSigningView,
  type PortalPendingSignature,
  type SignatureDesk,
  type SignerDocumentStream,
  type SigningFieldView,
  type SigningView,
} from "@coadvisor/signdoc";
// ═══════════════════════════════════════════════════════════════
// SIGNATURE ÉLECTRONIQUE — déléguée à @coadvisor/signdoc (ADR-012,
// Sprint 7c) : entité autonome commercialisable. Le câblage des
// ports (coffre, audit, chronologie, courriels, rendu certificat)
// vit dans ./signdoc-vault — importé ici pour effet de bord
// serveur, puis toute l'API du domaine est ré-exportée.
// ═══════════════════════════════════════════════════════════════
import "./signdoc-vault";

export { ensureCoAdvisorSigndocRuntime } from "./signdoc-vault";

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
  deriveInitials,
  stampSignatureFields,
  STAMP_ENGINE_VERSION,
  type StampFieldPlacement,
  type StampSignerEntry,
  DEFAULT_SIGNATURE_STYLE_ID,
  isSignatureStyleId,
  resolveSignatureStyle,
  signatureStampId,
  SIGNATURE_STYLES,
  signdocFontContentType,
  signdocFontPublicName,
  type SignatureStyle,
  envelopeCreateSchema,
  envelopeResendSchema,
  envelopeSignerSchema,
  signatureDeclineSchema,
  signatureFieldSchema,
  signatureSubmitSchema,
  signatureTemplateSaveSchema,
  typedNameSchema,
  type RequestMeta as SigndocRequestMeta,
  type SigndocActor,
} from "@coadvisor/signdoc";

export {
  generateReport,
  REPORT_KIND_LABELS,
  type ReportKind,
} from "./reports/service";
export { markdownToBlocks } from "./reports/builders";
export { PDF_RENDER_VERSION, renderPdf, type PdfBlock } from "./reports/pdf";

export {
  CLIENT_EXPORT_VERSION,
  exportClientData,
} from "./export/client-export";

// ═══ Sprint 8 — Sauvegarde/réplication des blobs (ADR-015) ═══
export {
  assertBackupAuthorized,
  BACKUP_VERSION,
  getBackupRoutingState,
  listBackupRuns,
  listBlobEntries,
  resolveManifestsDir,
  resolveReplicaDir,
  runBackupNow,
  runScheduledBackup,
} from "./backup/backup.service";
export type {
  BackupActor,
  BackupReport,
  BackupRunRow,
} from "./backup/backup.service";
export { getS3RoutingState, S3Client } from "./storage/s3-client";
export type { S3ListedObject } from "./storage/s3-client";
export { encodeS3Key, signRequestV4 } from "./storage/sigv4";
export type { SigV4Credentials, SigV4SignInput, SigV4Signed } from "./storage/sigv4";
