-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 7 — Correctif défense en profondeur (ADR-010)
--
-- Deux durcissements détectés par la suite d'intégration RLS :
--
-- 1. SÉMANTIQUE POSTGRESQL : pour un UPDATE, les expressions
--    WITH CHECK de TOUTES les politiques permissives sont combinées
--    par OU logique (indépendamment de leurs USING). La politique
--    « staff_update » avait un WITH CHECK limité au tenant_id :
--    un signataire portail non-staff pouvait donc voir sa transition
--    REQUESTED → CANCELLED validée par le WITH CHECK staff (tenant
--    concordant) plutôt que par la machine à états de signature.
--    ⇒ les politiques *_staff_update exigent désormais l'appartenance
--    ACTIVE au tenant (EXISTS tenant_users) dans USING **ET**
--    WITH CHECK : pour le non-staff, seule la politique
--    « portal_sign » gouverne alors la ligne nouvelle.
--
-- 2. ROBUSTESSE AUX GRANTS : l'immuabilité du journal d'audit est
--    garantie au niveau PRIVILÈGES (pas de politique FOR UPDATE/
--    DELETE + REVOKE de 0002). Un GRANT global ultérieur (ex. :
--    reprovisionnement d'environnement) peut annuler ce REVOKE ;
--    on le réaffirme ici (REVOKE est idempotent).
-- ─────────────────────────────────────────────────────────────

-- ═══════════════ 1. Politiques UPDATE staff durcies ═══════════

-- documents : modification réservée au staff ACTIF du tenant
DROP POLICY "documents_staff_update" ON "documents";
CREATE POLICY "documents_staff_update" ON "documents"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "documents"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "documents"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

-- document_shares : idem (création/révocation réservées au staff)
DROP POLICY "document_shares_staff_update" ON "document_shares";
CREATE POLICY "document_shares_staff_update" ON "document_shares"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "document_shares"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "document_shares"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

-- document_signatures : CRITIQUE — le WITH CHECK staff ne doit plus
-- « absorber » les transitions du signataire portail (voir en-tête).
DROP POLICY "document_signatures_staff_update" ON "document_signatures";
CREATE POLICY "document_signatures_staff_update" ON "document_signatures"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "document_signatures"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "document_signatures"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

-- ═══════════ 2. Immuabilité du journal d'audit réaffirmée ═════
REVOKE UPDATE, DELETE ON "audit_logs" FROM coadvisor_app;
