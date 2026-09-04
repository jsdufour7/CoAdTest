-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 4 — Financial Health Engine (données granulaires, ADR-007)
-- Généré via: prisma migrate diff --from-migrations --to-schema-datamodel
-- Tables: assets, liabilities, incomes, expenses, insurance_policies,
-- goals (financial_goals), retirement_plans, financial_contexts,
-- health_assessments, health_insights, health_progress, client_portal_links
-- ─────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CASH', 'INVESTMENT', 'REAL_ESTATE', 'BUSINESS', 'OTHER');

-- CreateEnum
CREATE TYPE "LiabilityType" AS ENUM ('MORTGAGE', 'LOAN', 'CREDIT_CARD', 'LINE_OF_CREDIT');

-- CreateEnum
CREATE TYPE "MoneyFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('HOUSING', 'FOOD', 'TRANSPORT', 'UTILITIES', 'INSURANCE', 'LEISURE', 'SAVINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceType" AS ENUM ('LIFE', 'DISABILITY', 'CRITICAL_ILLNESS', 'PROPERTY');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoalPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RegisteredUsage" AS ENUM ('NONE', 'PARTIAL', 'FULL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BeneficiariesStatus" AS ENUM ('YES', 'NO', 'OUTDATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HealthCategory" AS ENUM ('LIQUIDITY', 'BUDGET', 'DEBT', 'SAVINGS', 'INVESTMENTS', 'RETIREMENT', 'TAX', 'INSURANCE', 'ESTATE', 'GOALS');

-- CreateEnum
CREATE TYPE "HealthInsightType" AS ENUM ('STRENGTH', 'RISK', 'OPPORTUNITY', 'ACTION');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PortalLinkStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_tenant_id_fkey";

-- DropIndex
DROP INDEX "assessments_read_token_idx";

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "family_members" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notes" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenant_users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "AssetType" NOT NULL,
    "label" TEXT NOT NULL,
    "institution" TEXT,
    "value" DECIMAL(14,2) NOT NULL,
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "LiabilityType" NOT NULL,
    "label" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(6,3),
    "monthly_payment" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "MoneyFrequency" NOT NULL DEFAULT 'ANNUAL',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "label" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "MoneyFrequency" NOT NULL DEFAULT 'MONTHLY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "InsuranceType" NOT NULL,
    "provider" TEXT,
    "coverage" DECIMAL(14,2) NOT NULL,
    "premium" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(14,2) NOT NULL,
    "target_date" TIMESTAMP(3),
    "priority" "GoalPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retirement_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "retirement_age" INTEGER NOT NULL,
    "target_annual_income" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retirement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_contexts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "registered_accounts_usage" "RegisteredUsage" NOT NULL DEFAULT 'UNKNOWN',
    "has_will" BOOLEAN NOT NULL DEFAULT false,
    "beneficiaries_status" "BeneficiariesStatus" NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "category_scores" JSONB NOT NULL,
    "ratios" JSONB NOT NULL,
    "engine_version" TEXT NOT NULL,
    "calculated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_insights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "type" "HealthInsightType" NOT NULL,
    "category" "HealthCategory",
    "severity" "InsightSeverity" NOT NULL DEFAULT 'LOW',
    "message" TEXT NOT NULL,
    "recommendation" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "previous_score" INTEGER,
    "new_score" INTEGER NOT NULL,
    "delta" INTEGER,
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID,
    "invite_code_hash" TEXT NOT NULL,
    "status" "PortalLinkStatus" NOT NULL DEFAULT 'INVITED',
    "invited_by" UUID NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "consent_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_portal_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_tenant_id_idx" ON "assets"("tenant_id");

-- CreateIndex
CREATE INDEX "assets_client_id_idx" ON "assets"("client_id");

-- CreateIndex
CREATE INDEX "liabilities_tenant_id_idx" ON "liabilities"("tenant_id");

-- CreateIndex
CREATE INDEX "liabilities_client_id_idx" ON "liabilities"("client_id");

-- CreateIndex
CREATE INDEX "incomes_tenant_id_idx" ON "incomes"("tenant_id");

-- CreateIndex
CREATE INDEX "incomes_client_id_idx" ON "incomes"("client_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_idx" ON "expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "expenses_client_id_idx" ON "expenses"("client_id");

-- CreateIndex
CREATE INDEX "insurance_policies_tenant_id_idx" ON "insurance_policies"("tenant_id");

-- CreateIndex
CREATE INDEX "insurance_policies_client_id_idx" ON "insurance_policies"("client_id");

-- CreateIndex
CREATE INDEX "financial_goals_tenant_id_idx" ON "financial_goals"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_goals_client_id_status_idx" ON "financial_goals"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retirement_plans_client_id_key" ON "retirement_plans"("client_id");

-- CreateIndex
CREATE INDEX "retirement_plans_tenant_id_idx" ON "retirement_plans"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_contexts_client_id_key" ON "financial_contexts"("client_id");

-- CreateIndex
CREATE INDEX "financial_contexts_tenant_id_idx" ON "financial_contexts"("tenant_id");

-- CreateIndex
CREATE INDEX "health_assessments_tenant_id_idx" ON "health_assessments"("tenant_id");

-- CreateIndex
CREATE INDEX "health_assessments_client_id_created_at_idx" ON "health_assessments"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "health_insights_tenant_id_idx" ON "health_insights"("tenant_id");

-- CreateIndex
CREATE INDEX "health_insights_assessment_id_idx" ON "health_insights"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "health_progress_assessment_id_key" ON "health_progress"("assessment_id");

-- CreateIndex
CREATE INDEX "health_progress_tenant_id_idx" ON "health_progress"("tenant_id");

-- CreateIndex
CREATE INDEX "health_progress_client_id_created_at_idx" ON "health_progress"("client_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_links_invite_code_hash_key" ON "client_portal_links"("invite_code_hash");

-- CreateIndex
CREATE INDEX "client_portal_links_tenant_id_idx" ON "client_portal_links"("tenant_id");

-- CreateIndex
CREATE INDEX "client_portal_links_client_id_status_idx" ON "client_portal_links"("client_id", "status");

-- CreateIndex
CREATE INDEX "client_portal_links_user_id_idx" ON "client_portal_links"("user_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retirement_plans" ADD CONSTRAINT "retirement_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_contexts" ADD CONSTRAINT "financial_contexts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_assessments" ADD CONSTRAINT "health_assessments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_insights" ADD CONSTRAINT "health_insights_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "health_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_progress" ADD CONSTRAINT "health_progress_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "health_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_links" ADD CONSTRAINT "client_portal_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

