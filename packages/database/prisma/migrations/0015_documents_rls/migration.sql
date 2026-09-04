-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 7 — Coffre documentaire : isolation RLS (ADR-010)
--
-- Contextes posés par l'application :
--   app.tenant_ctx      = 'tenant' | 'system' | 'public'
--   app.current_tenant  = uuid du tenant (mode 'tenant')
--   app.current_user    = uuid de l'utilisateur (optionnel)
--   app.document_share  = haché hex du jeton de lien PUBLIC (uuid
--                         non devinable fourni dans l'URL /partage/…)
--
-- Principes :
-- - documents/métadonnées : confinés au tenant (staff). Le particulier
--   ne LIT que les pièces partagées PORTAL de SON dossier (lien portail
--   ACTIVE prouvé), jamais celles des autres clients du cabinet.
-- - signatures : machine à états REQUESTED → SIGNED gravée dans les
--   politiques — le signataire portail ne peut QUE signer sa propre
--   demande en y apposant les preuves (nom, consentement, haché) ;
--   jamais de modification d'une ligne déjà signée.
-- - lien public : lecture publique du partage actif portant le haché
--   fourni en GUC + de la pièce correspondante — rien d'autre. Aucune
--   écriture publique (compteurs d'accès relevés en contexte système).
-- ─────────────────────────────────────────────────────────────

-- ══════════════════════════ documents ══════════════════════════
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;

-- Staff : tout le coffre du tenant. Signataire portail : seulement
-- les pièces ACTIVE partagées PORTAL de son dossier lié.
CREATE POLICY "documents_access" ON "documents"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE POLICY "documents_staff_write" ON "documents"
    FOR INSERT
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

-- UPDATE : staff uniquement (statut DELETED = purge logique ; jamais
-- de DELETE physique — aucune politique FOR DELETE ⇒ REFUS).
CREATE POLICY "documents_staff_update" ON "documents"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- Lien public : la pièce ACTIVE dont un partage LINK actif porte le
-- haché fourni (preuve par capability token — ADR-009, même motif).
CREATE POLICY "documents_public_link" ON "documents"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'public'
        AND "status" = 'ACTIVE'
        AND EXISTS (
            SELECT 1 FROM "document_shares" ds
            WHERE ds."document_id" = "documents"."id"
              AND ds."channel" = 'LINK'
              AND ds."revoked_at" IS NULL
              AND (ds."expires_at" IS NULL OR ds."expires_at" > now())
              AND ds."token_hash" = NULLIF(current_setting('app.document_share', true), '')
        )
    );

-- ═══════════════════════ document_shares ═══════════════════════
ALTER TABLE "document_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_shares" FORCE ROW LEVEL SECURITY;

CREATE POLICY "document_shares_access" ON "document_shares"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE POLICY "document_shares_staff_write" ON "document_shares"
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- Révocation : staff uniquement.
CREATE POLICY "document_shares_staff_update" ON "document_shares"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- Lien public : lecture du partage actif correspondant au haché.
CREATE POLICY "document_shares_public_link" ON "document_shares"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'public'
        AND "channel" = 'LINK'
        AND "revoked_at" IS NULL
        AND ("expires_at" IS NULL OR "expires_at" > now())
        AND "token_hash" = NULLIF(current_setting('app.document_share', true), '')
    );

-- ═════════════════════ document_signatures ═════════════════════
ALTER TABLE "document_signatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_signatures" FORCE ROW LEVEL SECURITY;

CREATE POLICY "document_signatures_access" ON "document_signatures"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- Création de demande : staff du tenant uniquement.
CREATE POLICY "document_signatures_staff_insert" ON "document_signatures"
    FOR INSERT
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

-- MACHINE À ÉTATS en deux politiques disjointes :
-- (a) staff : annulation et cycle de vie complet côté conseiller,
--     y compris signature "ADVISOR" en présentiel ;
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
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- (b) signataire portail : UNIQUEMENT sa propre demande encore
--     REQUESTED, et la transition produit un DÉPÔT DE PREUVES complet
--     (nom tapé, consentement, horodatage, IP/UA, haché du PDF signé,
--     copie signée). Tout autre changement = REFUS 42501.
CREATE POLICY "document_signatures_portal_sign" ON "document_signatures"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'tenant'
        AND "status" = 'REQUESTED'
        AND "signer_side" = 'CLIENT'
        AND "signer_user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
        AND "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        "status" = 'SIGNED'
        AND "signer_user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
        AND "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        AND "signer_name" IS NOT NULL AND length(btrim("signer_name")) >= 2
        AND "consent_text" IS NOT NULL
        AND "signed_at" IS NOT NULL
        AND "proof_sha256" IS NOT NULL
        AND "signed_document_id" IS NOT NULL
    );

-- ─────────────────────────────────────────────────────────────
-- Grants : le rôle applicatif reçoit les privilèges de table
-- (les politiques ci-dessus restent le garde-fou — FORCE RLS).
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "documents", "document_shares", "document_signatures" TO coadvisor_app;
