-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 3 — RLS des entités plateforme FNAE (ADR-006)
--
-- Nouveau contexte posé par l'application (flux public) :
--   app.tenant_ctx        = 'public'
--   app.assessment_token  = capability token du visiteur (uuid)
--
-- Défaut = REFUS (comme partout ailleurs) :
--   * assessments : un visiteur ne peut lire QUE SON analyse
--     (token dans l'URL du portrait). Aucun accès tenant.
--   * leads : PII (courriel) — JAMAIS lisible par le contexte public ;
--     seul le tenant ciblé (boîte cabinet) ou le mode système y accède.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "assessments_access" ON "assessments"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "read_token" = NULLIF(current_setting('app.assessment_token', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR current_setting('app.tenant_ctx', true) = 'public'
    );

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "leads_isolation" ON "leads"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        OR (
            -- Dépôt public d'un lead : le questionnaire visé doit être
            -- prouvé par son capability token (anti-spam grossier).
            current_setting('app.tenant_ctx', true) = 'public'
            AND "tenant_id" IS NULL
            AND EXISTS (
                SELECT 1
                FROM "assessments" a
                WHERE a."id" = "assessment_id"
                  AND a."read_token" = NULLIF(current_setting('app.assessment_token', true), '')::uuid
            )
        )
    );
