-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('JUSTIFICATIF', 'RELEVE', 'AVIS_COTISATION', 'IDENTITE', 'CONTRAT', 'RAPPORT', 'AUTRE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "DocumentShareChannel" AS ENUM ('PORTAL', 'LINK');

-- CreateEnum
CREATE TYPE "DocumentSignatureStatus" AS ENUM ('REQUESTED', 'SIGNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'AUTRE',
    "label" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content_tag" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "channel" "DocumentShareChannel" NOT NULL,
    "token_hash" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signatures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "status" "DocumentSignatureStatus" NOT NULL DEFAULT 'REQUESTED',
    "signer_side" TEXT NOT NULL DEFAULT 'CLIENT',
    "signer_user_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signer_name" TEXT,
    "signed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "signed_ip_address" TEXT,
    "signed_user_agent" TEXT,
    "consent_text" TEXT,
    "proof_sha256" TEXT,
    "signed_document_id" UUID,

    CONSTRAINT "document_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_tenant_id_client_id_status_idx" ON "documents"("tenant_id", "client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_shares_token_hash_key" ON "document_shares"("token_hash");

-- CreateIndex
CREATE INDEX "document_shares_tenant_id_idx" ON "document_shares"("tenant_id");

-- CreateIndex
CREATE INDEX "document_shares_document_id_revoked_at_idx" ON "document_shares"("document_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_signatures_signed_document_id_key" ON "document_signatures"("signed_document_id");

-- CreateIndex
CREATE INDEX "document_signatures_tenant_id_idx" ON "document_signatures"("tenant_id");

-- CreateIndex
CREATE INDEX "document_signatures_document_id_status_idx" ON "document_signatures"("document_id", "status");

-- CreateIndex
CREATE INDEX "document_signatures_signer_user_id_status_idx" ON "document_signatures"("signer_user_id", "status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_signed_document_id_fkey" FOREIGN KEY ("signed_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_signer_user_id_fkey" FOREIGN KEY ("signer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

