-- Sprint 5 — Advisor Intelligence (ADR-008) : artefacts Copilot
-- immuables + traçables (provider, version, latence). Règle 3 :
-- jamais d'UPDATE ; régénérer crée une nouvelle ligne.

-- CreateEnum
CREATE TYPE "CopilotArtifactKind" AS ENUM ('SUMMARY', 'MEETING_PREP', 'SUGGESTIONS', 'CLIENT_REPORT');

-- CreateTable
CREATE TABLE "copilot_artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "CopilotArtifactKind" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "provider" TEXT NOT NULL DEFAULT 'local-composer',
    "model" TEXT NOT NULL DEFAULT 'composer-1.0',
    "composer_version" TEXT NOT NULL DEFAULT 'copilot-1.0',
    "fell_back" BOOLEAN NOT NULL DEFAULT false,
    "latency_ms" INTEGER,
    "generated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "copilot_artifacts_tenant_id_idx" ON "copilot_artifacts"("tenant_id");

-- CreateIndex
CREATE INDEX "copilot_artifacts_client_id_kind_created_at_idx" ON "copilot_artifacts"("client_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "copilot_artifacts" ADD CONSTRAINT "copilot_artifacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

