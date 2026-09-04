-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 6 — RLS Marketplace (ADR-009)
--
-- Contextes posés par l'application :
--   app.tenant_ctx          = 'tenant' | 'system' | 'public'
--   app.current_tenant      = uuid du tenant (contexte tenant)
--   app.marketplace_profile = uuid du profil listé visé (preuve
--                             d'insertion d'un lead « annuaire »)
--
-- Défaut = REFUS (comme partout ailleurs) :
--   * advisor_public_profiles : LISTE PUBLIQUE LIMITÉE aux profils
--     is_listed = true (opt-in Loi 25). Écriture : tenant seulement
--     (self-service du conseiller). Jamais de ligne non listée en
--     lecture publique — PII cloisonnée.
--   * marketplace_contact_requests : journal de preuve — INSERT public
--     autorisé SEULEMENT si le profil ciblé est listé et appartient au
--     tenant référencé ; SELECT réservé au tenant/système ; aucun
--     UPDATE/DELETE (immuabilité — voir GRANTs applicatifs existants).
--   * leads : nouvelle politique d'INSERTION publique « annuaire »
--     (source = 'annuaire', tenant renseigné, preuve par profil listé
--     via app.marketplace_profile) — complète, sans modifier, la
--     politique 0006 (questionnaire FNAE : tenant NULL + token).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "advisor_public_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "advisor_public_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "advisor_public_profiles_access" ON "advisor_public_profiles"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        OR (
            -- Annuaire public : uniquement les profils explicitement listés.
            current_setting('app.tenant_ctx', true) = 'public'
            AND "is_listed" = true
        )
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

ALTER TABLE "marketplace_contact_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_contact_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "marketplace_contact_requests_access" ON "marketplace_contact_requests"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        OR (
            -- Dépôt public d'une demande : le profil visé doit être listé
            -- ET appartenir au tenant référencé (anti-usurpation).
            current_setting('app.tenant_ctx', true) = 'public'
            AND EXISTS (
                SELECT 1
                FROM "advisor_public_profiles" p
                WHERE p."id" = "profile_id"
                  AND p."is_listed" = true
                  AND p."tenant_id" = "marketplace_contact_requests"."tenant_id"
            )
        )
    );

-- Leads « annuaire » : insertion publique prouvée par un profil listé
-- (GUC app.marketplace_profile) — distincte et additive vs 0006.
CREATE POLICY "leads_marketplace_insert" ON "leads"
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'public'
        AND "tenant_id" IS NOT NULL
        AND "source" = 'annuaire'
        AND EXISTS (
            SELECT 1
            FROM "advisor_public_profiles" p
            WHERE p."id" = NULLIF(current_setting('app.marketplace_profile', true), '')::uuid
              AND p."is_listed" = true
              AND p."tenant_id" = "leads"."tenant_id"
        )
    );
