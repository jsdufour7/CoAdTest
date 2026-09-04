-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 1 — Isolation multi-tenant (Row Level Security)
-- Voir ADR-003.
--
-- Contexte posé par l'application dans CHAQUE transaction :
--   app.tenant_ctx      = 'tenant' | 'system'
--   app.current_tenant  = uuid du tenant (mode 'tenant')
--   app.current_user    = uuid de l'utilisateur (optionnel)
--
-- Défaut = REFUS : toute requête sans contexte ne voit aucune ligne.
-- Le rôle applicatif (coadvisor_app) est NOBYPASSRLS : les politiques
-- s'appliquent donc toujours, même si le code contient un bug.
-- ─────────────────────────────────────────────────────────────

-- tenants : un tenant ne voit que lui-même
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenants_isolation" ON "tenants"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- tenant_users : restreint au tenant courant
ALTER TABLE "tenant_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_users_isolation" ON "tenant_users"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- users : mode système, soi-même, ou membre du même tenant
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "users_access" ON "users"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "id" = NULLIF(current_setting('app.current_user', true), '')::uuid
        OR EXISTS (
            SELECT 1
            FROM "tenant_users" tu
            WHERE tu."user_id" = "users"."id"
              AND tu."tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        )
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "id" = NULLIF(current_setting('app.current_user', true), '')::uuid
    );

-- sessions : mode système ou propriétaire de la session
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessions_access" ON "sessions"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
    );

-- audit_logs : restreint au tenant courant
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_isolation" ON "audit_logs"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

-- Immutabilité du journal d'audit (Loi 25 / traçabilité) :
-- le rôle applicatif ne peut JAMAIS modifier ni supprimer une entrée.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coadvisor_app') THEN
        REVOKE UPDATE, DELETE ON "audit_logs" FROM coadvisor_app;
    END IF;
END $$;
