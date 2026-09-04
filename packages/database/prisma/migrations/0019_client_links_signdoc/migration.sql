-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 7c — Signdoc autonome & liens clients (ADR-012)
--
-- 1. client_links : liens inter-clients CERTIFIÉS par le
--    professionnel (couple, famille, affaires, procuration) —
--    navigation croisée des fiches et aptitude « ménage ». Créés
--    et révoqués UNIQUEMENT par un membre du cabinet (audités),
--    jamais exposés au contexte public externe ni au portail.
-- 2. signature_signers.signature_style : style adopté (« façon
--    DocuSign ») — registre de polices tenu par @coadvisor/signdoc,
--    la valeur est un identifiant de style, pas une contrainte DB
--    (le registre évolue sans migration).
-- 3. document_signatures.resent_from_id : traçabilité du « nouvel
--    envoi » (clone d'une enveloppe close après discussion —
--    signataires et champs copiés, preuves reparties à neuf).
-- ─────────────────────────────────────────────────────────────

-- ═══════════════ Énumération ═══════════════
CREATE TYPE "ClientLinkType" AS ENUM (
    'CONJOINT', 'FAMILLE', 'AFFAIRES', 'PROCURATION', 'AUTRE'
);

-- ═══════════════ client_links ═══════════════
CREATE TABLE "client_links" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID NOT NULL,
    "client_id_a" UUID NOT NULL,
    "client_id_b" UUID NOT NULL,
    "type"        "ClientLinkType" NOT NULL,
    "note"        TEXT,
    "created_by"  UUID NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_links_distinct" CHECK ("client_id_a" <> "client_id_b"),
    CONSTRAINT "client_links_ordered"  CHECK ("client_id_a" < "client_id_b"),
    CONSTRAINT "client_links_tenant_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "client_links_client_a_fkey"
        FOREIGN KEY ("client_id_a") REFERENCES "clients"("id") ON DELETE CASCADE,
    CONSTRAINT "client_links_client_b_fkey"
        FOREIGN KEY ("client_id_b") REFERENCES "clients"("id") ON DELETE CASCADE,
    CONSTRAINT "client_links_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
    CONSTRAINT "client_links_pair_key" UNIQUE ("tenant_id", "client_id_a", "client_id_b")
);

CREATE INDEX "client_links_tenant_idx"  ON "client_links"("tenant_id");
CREATE INDEX "client_links_client_a_idx" ON "client_links"("client_id_a");
CREATE INDEX "client_links_client_b_idx" ON "client_links"("client_id_b");

-- RLS : lecture/mutation réservées au MEMBRE DU CABINET du
-- tenant (contexte tenant) ; contexte système toujours admis ;
-- aucune politique publique (jeton externe) ni portail : la
-- table est introuvable pour ces confins (défaut deny).
ALTER TABLE "client_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_links" FORCE ROW LEVEL SECURITY;

CREATE POLICY "client_links_staff_select" ON "client_links"
    FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "client_links"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
                  AND tu."role" <> 'CLIENT'
            )
        )
    );

CREATE POLICY "client_links_staff_insert" ON "client_links"
    FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND "created_by" = NULLIF(current_setting('app.current_user', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "client_links"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
                  AND tu."role" <> 'CLIENT'
            )
        )
    );

CREATE POLICY "client_links_staff_delete" ON "client_links"
    FOR DELETE
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "client_links"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
                  AND tu."role" <> 'CLIENT'
            )
        )
    );

-- ═════ Signdoc : style de signature adopté + nouvel envoi ═════
ALTER TABLE "signature_signers"
    ADD COLUMN "signature_style" TEXT;

ALTER TABLE "document_signatures"
    ADD COLUMN "resent_from_id" UUID,
    ADD CONSTRAINT "document_signatures_resent_from_fkey"
        FOREIGN KEY ("resent_from_id")
        REFERENCES "document_signatures"("id") ON DELETE SET NULL;

CREATE INDEX "document_signatures_resent_from_idx"
    ON "document_signatures"("resent_from_id");

-- ═══════════════ Droits applicatifs ═══════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON "client_links" TO coadvisor_app;
REVOKE UPDATE, DELETE ON "audit_logs" FROM coadvisor_app;
