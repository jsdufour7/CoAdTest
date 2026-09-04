-- CreateEnum
CREATE TYPE "MarketplaceSpecialty" AS ENUM ('EMERGENCY_FUND', 'DEBT', 'SAVINGS', 'RETIREMENT', 'PROTECTION', 'GOALS');

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "assessment_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "advisor_public_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "advisor_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "regions" TEXT[],
    "languages" TEXT[],
    "specialties" "MarketplaceSpecialty"[],
    "years_experience" INTEGER,
    "credentials_text" TEXT,
    "photo_data" TEXT,
    "is_listed" BOOLEAN NOT NULL DEFAULT false,
    "listed_at" TIMESTAMP(3),
    "unlisted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisor_public_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_contact_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "lead_id" UUID,
    "prospect_name" TEXT NOT NULL,
    "prospect_email" TEXT NOT NULL,
    "prospect_phone" TEXT,
    "message" TEXT NOT NULL,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "match_score" INTEGER,
    "match_reasons" JSONB,
    "engine_version" TEXT NOT NULL DEFAULT 'mktmatch-1.0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "advisor_public_profiles_advisor_id_key" ON "advisor_public_profiles"("advisor_id");

-- CreateIndex
CREATE INDEX "advisor_public_profiles_tenant_id_idx" ON "advisor_public_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "advisor_public_profiles_is_listed_idx" ON "advisor_public_profiles"("is_listed");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_contact_requests_lead_id_key" ON "marketplace_contact_requests"("lead_id");

-- CreateIndex
CREATE INDEX "marketplace_contact_requests_tenant_id_idx" ON "marketplace_contact_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "marketplace_contact_requests_profile_id_created_at_idx" ON "marketplace_contact_requests"("profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "advisor_public_profiles" ADD CONSTRAINT "advisor_public_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisor_public_profiles" ADD CONSTRAINT "advisor_public_profiles_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_contact_requests" ADD CONSTRAINT "marketplace_contact_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "advisor_public_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_contact_requests" ADD CONSTRAINT "marketplace_contact_requests_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

