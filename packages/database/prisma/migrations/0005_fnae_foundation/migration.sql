-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 3 — Financial Needs Assessment Engine
-- Entités à PORTÉE PLATEFORME (ADR-006) :
--   * assessments : questionnaire public anonyme — aucun tenant_id.
--     Lecture par capability token (read_token non devinable).
--   * leads : tenant_id NULLABLE — NULL = boîte plateforme
--     (matching futur), renseigné = cabinet référent (?cabinet=slug).
-- Le consentement Loi 25 est matérialisé par consent + consent_at.
-- ─────────────────────────────────────────────────────────────

-- Enum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'DISMISSED');

-- Table "assessments"
CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "read_token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'marketplace',
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "category_scores" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "engine_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessments_read_token_key" UNIQUE ("read_token")
);
CREATE INDEX "assessments_read_token_idx" ON "assessments"("read_token");

-- Table "leads"
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "assessment_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'marketplace',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "client_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leads_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "leads_tenant_id_status_idx" ON "leads"("tenant_id", "status");
CREATE INDEX "leads_assessment_id_idx" ON "leads"("assessment_id");
