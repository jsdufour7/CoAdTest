-- ════════════════════════════════════════════════════════════════
-- Sprint 8 — correctif RLS événements produit (découvert au premier
-- seed 8) : les utilisateurs PORTAIL n'ont PAS de ligne tenant_users
-- (ils prouvent leur identité par leur session vivante — même base
-- que la politique « portal_sign » de la migration 0015). La branche
-- membre reste pour le staff ; ajout d'une branche « portail
-- authentifié » bornée au tenant courant.
-- Menace couverte : écriture append-only non relisable par le portail
-- (SELECT = staff uniquement), bruit de métriques au pire, zéro fuite.
-- ════════════════════════════════════════════════════════════════

DROP POLICY "product_events_insert" ON "product_events";

CREATE POLICY "product_events_insert" ON "product_events"
    FOR INSERT WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            -- Staff du tenant (tout rôle actif, y compris compte
            -- CLIENT-membre historique : l'insertion n'ouvre aucune lecture).
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "product_events"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
            )
        )
        OR (
            -- Portail authentifié (sans adhésion tenant_users) : session
            -- vivante du current_user OU lien portail revendiqué sur ce
            -- tenant (preuves jumelles, portail exclu du SELECT de toute
            -- façon) — toujours borné au tenant courant.
            current_setting('app.tenant_ctx', true) = 'tenant'
            AND "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND (
                EXISTS (
                    SELECT 1 FROM "sessions" s
                    WHERE s."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                      AND s."revoked_at" IS NULL
                      AND s."expires_at" > now()
                )
                OR EXISTS (
                    SELECT 1 FROM "client_portal_links" cpl
                    WHERE cpl."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                      AND cpl."tenant_id" = "product_events"."tenant_id"
                      AND cpl."status" = 'ACTIVE'
                      AND cpl."revoked_at" IS NULL
                )
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
