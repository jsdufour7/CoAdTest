-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 2 — RLS multi-tenant pour le CRM (ADR-003)
-- Même modèle qu'en 0002 : défaut = refus ; contexte posé par
-- withTenantContext / withSystemContext.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'clients', 'family_members', 'timeline_events', 'notes', 'tasks'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ENABLE ROW LEVEL SECURITY;
             ALTER TABLE %I FORCE ROW LEVEL SECURITY;
             CREATE POLICY %I ON %I
               USING (
                 current_setting(''app.tenant_ctx'', true) = ''system''
                 OR "tenant_id" = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid
               )
               WITH CHECK (
                 current_setting(''app.tenant_ctx'', true) = ''system''
                 OR "tenant_id" = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid
               );',
            t, t, t || '_isolation', t
        );
    END LOOP;
END $$;
