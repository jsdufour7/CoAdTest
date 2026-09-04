-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 4 — RLS multi-tenant pour le Financial Health Engine
-- Même modèle qu'en 0002 : défaut = refus ; contexte posé par
-- withTenantContext / withSystemContext.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'assets', 'liabilities', 'incomes', 'expenses', 'insurance_policies', 'financial_goals', 'retirement_plans', 'financial_contexts', 'health_assessments', 'health_insights', 'health_progress', 'client_portal_links'
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
