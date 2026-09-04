-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 7b — Signature électronique avancée (ADR-011)
--
-- document_signatures devient une ENVELOPPE multi-signataires
-- (façon DocuSign) : N signataires (couple via liens portail,
-- contre-signature du conseiller, externe par courriel sécurisé),
-- champs positionnés, ordre séquentiel/parallèle, refus motivé,
-- expiration, relances, gabarits.
--
-- Les colonnes signataire héritées du mono-signataire (Sprint 7)
-- sont migrées vers des lignes signature_signers puis supprimées ;
-- les preuves déjà consignées (nom, consentement, IP/UA, haché)
-- sont préservées à l'identique.
-- ─────────────────────────────────────────────────────────────

-- ═══════════════ Énumérations ═══════════════
ALTER TYPE "DocumentSignatureStatus" ADD VALUE 'PARTIALLY_SIGNED';
ALTER TYPE "DocumentSignatureStatus" ADD VALUE 'DECLINED';
ALTER TYPE "DocumentSignatureStatus" ADD VALUE 'EXPIRED';

CREATE TYPE "SigningMode" AS ENUM ('SEQUENTIAL', 'PARALLEL');
CREATE TYPE "SignatureSignerKind" AS ENUM ('PORTAL_USER', 'STAFF', 'EXTERNAL');
CREATE TYPE "SignatureSignerStatus" AS ENUM ('PENDING', 'SIGNED', 'DECLINED');
CREATE TYPE "SignatureFieldKind" AS ENUM ('SIGNATURE', 'INITIALS', 'DATE');

-- ═══════════════ Enveloppe : nouvelles colonnes ═══════════════
ALTER TABLE "document_signatures"
    ADD COLUMN "signing_mode" "SigningMode" NOT NULL DEFAULT 'SEQUENTIAL',
    ADD COLUMN "message" TEXT,
    ADD COLUMN "expires_at" TIMESTAMP(3),
    ADD COLUMN "declined_at" TIMESTAMP(3),
    ADD COLUMN "expired_at" TIMESTAMP(3),
    ADD COLUMN "last_reminder_at" TIMESTAMP(3),
    ADD COLUMN "reminder_count" INTEGER NOT NULL DEFAULT 0;

-- ═══════════════ Nouvelles tables ═══════════════
CREATE TABLE "signature_signers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "signature_id" UUID NOT NULL,
    "kind" "SignatureSignerKind" NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "SignatureSignerStatus" NOT NULL DEFAULT 'PENDING',
    "token_hash" TEXT,
    "signer_name" TEXT,
    "signed_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "consent_text" TEXT,
    "initials_text" TEXT,
    "drawn_png" BYTEA,
    "decline_reason" TEXT,
    "declined_at" TIMESTAMP(3),
    "reminded_at" TIMESTAMP(3),

    CONSTRAINT "signature_signers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signature_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "signature_id" UUID NOT NULL,
    "signer_id" UUID NOT NULL,
    "page_index" INTEGER NOT NULL,
    "kind" "SignatureFieldKind" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "signature_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signature_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_templates_pkey" PRIMARY KEY ("id")
);

-- ═══════════════ Index ═══════════════
CREATE UNIQUE INDEX "signature_signers_token_hash_key" ON "signature_signers"("token_hash");
CREATE INDEX "signature_signers_tenant_id_idx" ON "signature_signers"("tenant_id");
CREATE INDEX "signature_signers_signature_id_sort_order_idx" ON "signature_signers"("signature_id", "sort_order");
CREATE INDEX "signature_signers_user_id_status_idx" ON "signature_signers"("user_id", "status");
CREATE INDEX "signature_fields_signature_id_idx" ON "signature_fields"("signature_id");
CREATE INDEX "signature_templates_tenant_id_idx" ON "signature_templates"("tenant_id");

-- ═══════════════ Clés étrangères ═══════════════
ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "document_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "document_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "signature_signers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signature_templates" ADD CONSTRAINT "signature_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signature_templates" ADD CONSTRAINT "signature_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════ Migration des données mono-signataire ═══════════════
-- Chaque enveloppe héritée reçoit sa ligne signataire unique ;
-- kind : ADVISOR → STAFF, CLIENT → PORTAL_USER ; statut signé
-- préservé avec toutes les preuves ; courriel résolu via le compte
-- (signataire, sinon le demandeur — signature conseiller d'office).
INSERT INTO "signature_signers" (
    "id", "tenant_id", "signature_id", "kind", "user_id", "email",
    "full_name", "sort_order", "status", "signer_name", "signed_at",
    "ip_address", "user_agent", "consent_text"
)
SELECT
    gen_random_uuid(),
    ds."tenant_id",
    ds."id",
    CASE WHEN ds."signer_side" = 'ADVISOR'
         THEN 'STAFF'::"SignatureSignerKind"
         ELSE 'PORTAL_USER'::"SignatureSignerKind" END,
    COALESCE(ds."signer_user_id", ru."id"),
    COALESCE(u."email", ru."email", 'inconnu@exemple.ca'),
    COALESCE(
        NULLIF(ds."signer_name", ''),
        NULLIF(trim(concat_ws(' ', u."first_name", u."last_name")), ''),
        NULLIF(trim(concat_ws(' ', ru."first_name", ru."last_name")), ''),
        'Signataire'
    ),
    0,
    CASE WHEN ds."status" = 'SIGNED'
         THEN 'SIGNED'::"SignatureSignerStatus"
         ELSE 'PENDING'::"SignatureSignerStatus" END,
    ds."signer_name",
    ds."signed_at",
    ds."signed_ip_address",
    ds."signed_user_agent",
    ds."consent_text"
FROM "document_signatures" ds
LEFT JOIN "users" u ON u."id" = ds."signer_user_id"
LEFT JOIN "users" ru ON ru."id" = ds."requested_by_id";

-- ═══════════════ Retrait des colonnes héritées ═══════════════
-- La politique mono-signataire du Sprint 7 référence signer_side :
-- la transition du signataire migre vers signature_signers (0018).
DROP POLICY IF EXISTS "document_signatures_portal_sign" ON "document_signatures";

-- (contraintes/index liés supprimés avec les colonnes)
ALTER TABLE "document_signatures"
    DROP COLUMN "signer_side",
    DROP COLUMN "signer_user_id",
    DROP COLUMN "signer_name",
    DROP COLUMN "signed_ip_address",
    DROP COLUMN "signed_user_agent",
    DROP COLUMN "consent_text";
