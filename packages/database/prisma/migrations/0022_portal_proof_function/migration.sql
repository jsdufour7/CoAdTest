-- ════════════════════════════════════════════════════════════════
-- Sprint 8 — durcissement RLS événements produit (2e correctif) :
-- les tables preuves du portail (sessions, client_portal_links) sont
-- ELLES-MÊMES invisibles sous RLS en contexte tenant, donc aucune
-- sous-requête EXISTS ne peut les voir depuis une politique. La
-- preuve passe par une fonction SECURITY DEFINER (propriétaire
-- BYPASSRLS) — surface minimale (un booléen, zéro donnée exposée),
-- exécutable uniquement par le rôle applicatif. Nota : les paires
-- (user, tenant) doivent être résolues en amont de la politique — les
-- tables users/sessions/liens sont invisibles sous RLS même en
-- sous-requête de politique.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public."app_portal_proof"(p_user uuid, p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    -- Portail authentifié = session vivante OU lien portail actif sur
    -- CE tenant. Aucune des deux branches n'expose de donnée : booléen.
    SELECT EXISTS (
               SELECT 1 FROM "sessions" s
               WHERE s."user_id" = p_user
                 AND s."revoked_at" IS NULL
                 AND s."expires_at" > now()
           )
        OR EXISTS (
               SELECT 1 FROM "client_portal_links" cpl
               WHERE cpl."user_id" = p_user
                 AND cpl."tenant_id" = p_tenant
                 AND cpl."status" = 'ACTIVE'
                 AND cpl."revoked_at" IS NULL
           );
$$;

REVOKE ALL ON FUNCTION public."app_portal_proof"(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."app_portal_proof"(uuid, uuid) TO coadvisor_app;

DROP POLICY "product_events_insert" ON "product_events";

CREATE POLICY "product_events_insert" ON "product_events"
    FOR INSERT WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            -- Staff du tenant (tout rôle actif).
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "product_events"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
        OR (
            -- Portail authentifié (preuve par fonction SECURITY DEFINER,
            -- voir en-tête) — toujours borné au tenant courant.
            current_setting('app.tenant_ctx', true) = 'tenant'
            AND "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND public."app_portal_proof"(
                NULLIF(current_setting('app.current_user', true), '')::uuid,
                "product_events"."tenant_id"
            )
        )
        OR (
            current_setting('app.tenant_ctx', true) = 'public'
            AND (
                EXISTS (
                    SELECT 1 FROM "advisor_public_profiles" p
                    WHERE p."id" = NULLIF(current_setting('app.marketplace_profile', true), '')::uuid
                      AND p."tenant_id" = "product_events"."tenant_id"
                )
                OR EXISTS (
                    SELECT 1 FROM "document_shares" ds
                    WHERE ds."token_hash" = NULLIF(current_setting('app.document_share', true), '')
                      AND ds."tenant_id" = "product_events"."tenant_id"
                )
                OR EXISTS (
                    SELECT 1 FROM "signature_signers" ss
                    JOIN "document_signatures" d ON d."id" = ss."signature_id"
                    WHERE ss."token_hash" = NULLIF(current_setting('app.signature_token', true), '')
                      AND d."tenant_id" = "product_events"."tenant_id"
                )
            )
        )
    );
