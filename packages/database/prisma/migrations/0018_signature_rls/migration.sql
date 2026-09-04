-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 7b — Enveloppes de signature : RLS (ADR-011)
--
-- Nouveau contexte applicatif :
--   app.signature_token = haché SHA-256 hex du jeton courriel d'un
--   signataire EXTERNE (uuid non devinable dans l'URL /signature/…).
--
-- Principes :
-- - La machine à états du signataire migre de document_signatures
--   vers signature_signers : (a) portail authentifié — sa seule
--   ligne PENDING, son tour (séquentiel), transition avec DÉPÔT DE
--   PREUVES complet (SIGNED : nom, consentement, horodatage ;
--   DECLINED : motif, horodatage) ; (b) externe — idem par jeton
--   capability, en contexte public.
-- - L'AGRÉGATION (PARTIALLY_SIGNED, complétion, PDF final) n'est
--   jamais opérée par un signataire : transitions d'enveloppe
--   réservées au staff (motif durci 0016) et au contexte système.
-- - Le tour de signature est gravé dans la RLS via des fonctions
--   SECURITY DEFINER (visibilité inter-signataires, indépendante du
--   confinement SELECT — sous PostgreSQL les sous-requêtes des
--   politiques subissent la RLS du rôle courant).
-- - Aucun accès public au-delà du jeton : 1 ligne signataire
--   (sans PII des cosignataires), l'enveloppe associée, les champs
--   qui lui sont assignés, la pièce PDF ACTIVE à signer.
-- ─────────────────────────────────────────────────────────────

-- ═════ Fonctions SECURITY DEFINER (tour + enveloppe active) ════
-- row_security = off : l'évaluation ne dépend PAS du confinement
-- SELECT du rôle appelant (sinon le contrôle devient vacuous en
-- contexte public). Lecture seule, paramètres stricts, search_path
-- figé contre le détournement de schéma.

CREATE OR REPLACE FUNCTION signature_envelope_active(p_signature_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."document_signatures" env
        WHERE env."id" = p_signature_id
          AND env."status" IN ('REQUESTED', 'PARTIALLY_SIGNED')
          AND (env."expires_at" IS NULL OR env."expires_at" > now())
    );
$$;

CREATE OR REPLACE FUNCTION signature_turn_open(p_signature_id uuid, p_sort_order integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
    SELECT (
        (SELECT env."signing_mode"
         FROM public."document_signatures" env
         WHERE env."id" = p_signature_id) = 'PARALLEL'
    )
    OR NOT EXISTS (
        SELECT 1
        FROM public."signature_signers" prev
        WHERE prev."signature_id" = p_signature_id
          AND prev."status" = 'PENDING'
          AND prev."sort_order" < p_sort_order
    );
$$;

-- ═══════════════ signature_signers ═══════════════
ALTER TABLE "signature_signers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_signers" FORCE ROW LEVEL SECURITY;

-- Lecture : staff/tenant (le service confine les projections) ;
-- public : UNIQUEMENT sa propre ligne par jeton (aucune PII des
-- cosignataires exposée au niveau de la base).
CREATE POLICY "signature_signers_access" ON "signature_signers"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        OR (
            current_setting('app.tenant_ctx', true) = 'public'
            AND "kind" = 'EXTERNAL'
            AND "token_hash" = NULLIF(current_setting('app.signature_token', true), '')
        )
    );

-- Création : staff ACTIF du tenant (composition de l'enveloppe).
CREATE POLICY "signature_signers_staff_insert" ON "signature_signers"
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "signature_signers"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

-- Staff : cycle complet (contre-signature en cabinet, relances…).
-- Motif durci 0016 : EXISTS tenant_users dans USING **ET**
-- WITH CHECK — sans quoi le OR logique du WITH CHECK PostgreSQL
-- absorberait les transitions des signataires non-staff.
CREATE POLICY "signature_signers_staff_update" ON "signature_signers"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "signature_signers"."tenant_id"
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
                WHERE tu."tenant_id" = "signature_signers"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

-- Signataire PORTAIL : sa ligne, son tour, enveloppe active —
-- et la transition DÉPOSE LES PREUVES (rien d'autre n'est permis).
CREATE POLICY "signature_signers_portal_sign" ON "signature_signers"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'tenant'
        AND "kind" = 'PORTAL_USER'
        AND "user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
        AND "status" = 'PENDING'
        AND "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        AND signature_envelope_active("signature_id")
        AND signature_turn_open("signature_id", "sort_order")
    )
    WITH CHECK (
        "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        AND "user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
        AND (
            (
                "status" = 'SIGNED'
                AND "signer_name" IS NOT NULL AND length(btrim("signer_name")) >= 2
                AND "consent_text" IS NOT NULL
                AND "signed_at" IS NOT NULL
            )
            OR (
                "status" = 'DECLINED'
                AND "decline_reason" IS NOT NULL AND length(btrim("decline_reason")) >= 4
                AND "declined_at" IS NOT NULL
            )
        )
    );

-- Signataire EXTERNE : identique, authentifié par capability token.
CREATE POLICY "signature_signers_external_sign" ON "signature_signers"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'public'
        AND "kind" = 'EXTERNAL'
        AND "token_hash" = NULLIF(current_setting('app.signature_token', true), '')
        AND "status" = 'PENDING'
        AND signature_envelope_active("signature_id")
        AND signature_turn_open("signature_id", "sort_order")
    )
    WITH CHECK (
        "token_hash" = NULLIF(current_setting('app.signature_token', true), '')
        AND (
            (
                "status" = 'SIGNED'
                AND "signer_name" IS NOT NULL AND length(btrim("signer_name")) >= 2
                AND "consent_text" IS NOT NULL
                AND "signed_at" IS NOT NULL
            )
            OR (
                "status" = 'DECLINED'
                AND "decline_reason" IS NOT NULL AND length(btrim("decline_reason")) >= 4
                AND "declined_at" IS NOT NULL
            )
        )
    );

-- Pas de politique DELETE : suppression interdite (preuve).

-- ═══════════════ signature_fields ═══════════════
ALTER TABLE "signature_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_fields" FORCE ROW LEVEL SECURITY;

CREATE POLICY "signature_fields_access" ON "signature_fields"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        OR (
            current_setting('app.tenant_ctx', true) = 'public'
            AND EXISTS (
                SELECT 1 FROM "signature_signers" s
                WHERE s."id" = "signature_fields"."signer_id"
                  AND s."kind" = 'EXTERNAL'
                  AND s."token_hash" = NULLIF(current_setting('app.signature_token', true), '')
            )
        )
    );

CREATE POLICY "signature_fields_staff_insert" ON "signature_fields"
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "signature_fields"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

CREATE POLICY "signature_fields_staff_update" ON "signature_fields"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "signature_fields"."tenant_id"
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
                WHERE tu."tenant_id" = "signature_fields"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

-- ═══════════════ signature_templates ═══════════════
ALTER TABLE "signature_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "signature_templates_access" ON "signature_templates"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE POLICY "signature_templates_staff_insert" ON "signature_templates"
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "signature_templates"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

CREATE POLICY "signature_templates_staff_update" ON "signature_templates"
    FOR UPDATE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE POLICY "signature_templates_staff_delete" ON "signature_templates"
    FOR DELETE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "signature_templates"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
    );

-- ═══════ document_signatures : la transition signataire part ═══
-- Les signataires ne touchent plus l'enveloppe : leurs preuves
-- vivent dans signature_signers ; l'agrégation est staff/système.
DROP POLICY IF EXISTS "document_signatures_portal_sign" ON "document_signatures";

-- Enveloppe lisible par le signataire EXTERNE titulaire du jeton
-- (métadonnées : statut, échéance, message — jamais la PII staff).
CREATE POLICY "document_signatures_public_signer" ON "document_signatures"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'public'
        AND EXISTS (
            SELECT 1 FROM "signature_signers" s
            WHERE s."signature_id" = "document_signatures"."id"
              AND s."kind" = 'EXTERNAL'
              AND s."token_hash" = NULLIF(current_setting('app.signature_token', true), '')
        )
    );

-- ═══════ documents : lecture publique de la pièce à signer ════
CREATE POLICY "documents_public_signature" ON "documents"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'public'
        AND "status" = 'ACTIVE'
        AND EXISTS (
            SELECT 1
            FROM "document_signatures" env
            JOIN "signature_signers" s ON s."signature_id" = env."id"
            WHERE env."document_id" = "documents"."id"
              AND s."kind" = 'EXTERNAL'
              AND s."token_hash" = NULLIF(current_setting('app.signature_token', true), '')
              AND env."status" IN ('REQUESTED', 'PARTIALLY_SIGNED')
              AND (env."expires_at" IS NULL OR env."expires_at" > now())
        )
    );

-- ─────────────────────────────────────────────────────────────
-- Grants + immuabilité du journal d'audit réaffirmée (motif 0016).
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "signature_signers", "signature_fields", "signature_templates" TO coadvisor_app;

REVOKE UPDATE, DELETE ON "audit_logs" FROM coadvisor_app;
