-- ─────────────────────────────────────────────────────────────
-- CoAdvisor — Initialisation PostgreSQL (développement local)
-- Exécuté automatiquement par l'image Docker au premier démarrage.
-- ─────────────────────────────────────────────────────────────

-- Extensions (pgvector : prérequis AI-ready / RAG futur)
CREATE EXTENSION IF NOT EXISTS vector;

-- Rôle applicatif SANS contournement RLS (défense en profondeur).
-- Le code applicatif se connecte avec ce rôle : les politiques RLS
-- s'appliquent donc à toutes les requêtes, toujours.
CREATE ROLE coadvisor_app LOGIN PASSWORD 'coadvisor_app_dev_password' NOBYPASSRLS;

GRANT CONNECT ON DATABASE coadvisor TO coadvisor_app;
GRANT USAGE ON SCHEMA public TO coadvisor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO coadvisor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coadvisor_app;
