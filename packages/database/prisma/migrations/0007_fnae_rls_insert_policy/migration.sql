-- ─────────────────────────────────────────────────────────────
-- CoAdvisor — Correctif RLS FNAE (retour validation Sprint 3)
--
-- PIÈGE DÉJOUÉ : toute écriture Prisma (create/update) émet
-- INSERT … RETURNING / UPDATE … RETURNING. La lecture du RETURNING
-- exige que la ligne passe les politiques SELECT (USING) EN PLUS du
-- WITH CHECK. Une ligne « assessments » n'étant visible que par son
-- capability token, un INSERT qui ne présente pas ce token (GUC
-- app.assessment_token = token de la ligne) échouait en 42501
-- « violates row-level security policy » — message trompeur, car le
-- WITH CHECK, lui, passait.
--
-- Correctifs :
--   1. Le capability token est généré par l'APPLICATION et le GUC
--      est posé AVANT l'insert (packages/fnae).
--   2. Les politiques sont éclatées PAR COMMANDE (intention explicite).
--   3. La branche « dépôt public de lead » de 0006 est RETIRÉE : un
--      INSERT public sur leads aurait eu le même problème de RETURNING
--      (PII jamais visible au public) ET le dépôt passe déjà par le
--      contexte system côté serveur (captureLead). Piège à futurs
--      développeurs éliminé.
-- ─────────────────────────────────────────────────────────────

-- assessments : éclatement par commande (comportement inchangé)
DROP POLICY "assessments_access" ON "assessments";

-- SELECT : mode system OU détenteur du capability token
CREATE POLICY "assessments_select" ON "assessments" FOR SELECT
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "read_token" = NULLIF(current_setting('app.assessment_token', true), '')::uuid
    );

-- INSERT : questionnaire public (sans tenant) OU mode system.
-- Avec un INSERT … RETURNING (Prisma), la ligne retournée doit AUSSI
-- satisfaire assessments_select → l'app pose app.assessment_token
-- AVANT l'insertion (voir packages/fnae/src/services/public.ts).
CREATE POLICY "assessments_insert" ON "assessments" FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR current_setting('app.tenant_ctx', true) = 'public'
    );

-- UPDATE/DELETE : réservés au mode system (ménage, tests, purge future)
CREATE POLICY "assessments_manage" ON "assessments" FOR ALL
    USING (current_setting('app.tenant_ctx', true) = 'system')
    WITH CHECK (current_setting('app.tenant_ctx', true) = 'system');

-- leads : retrait de la branche « dépôt public » inutilisable (RETURNING
-- filtrerait la PII) — le dépôt passe par le contexte system applicatif.
DROP POLICY "leads_isolation" ON "leads";
CREATE POLICY "leads_isolation" ON "leads"
    USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );
