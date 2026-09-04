-- Sprint 5 — RLS copilot_artifacts : même politique d'isolation que le
-- reste du modèle tenant (ADR-003) : contexte système OU tenant courant,
-- FORCE ROW LEVEL SECURITY (le propriétaire n'y échappe pas).
ALTER TABLE "copilot_artifacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_artifacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "copilot_artifacts_isolation" ON "copilot_artifacts"
  USING (
    current_setting('app.tenant_ctx', true) = 'system'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.tenant_ctx', true) = 'system'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
