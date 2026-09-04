-- ════════════════════════════════════════════════════════════════
-- Sprint 8 — SaaS Commercialization (ADR-013/014/015)
-- Abonnements & factures (Stripe/simulateur), événements produit
-- first-party (Loi 25, pseudonymisés), registre des sauvegardes
-- répliquées (S3 Canada), photo marketplace vers le coffre chiffré.
-- ════════════════════════════════════════════════════════════════

CREATE TYPE "BillingProvider" AS ENUM ('SIMULATOR', 'STRIPE');
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');
CREATE TYPE "ProductEventActorKind" AS ENUM ('STAFF', 'PORTAL', 'EXTERNAL', 'ANONYMOUS', 'SYSTEM');
CREATE TYPE "BackupTrigger" AS ENUM ('MANUAL', 'SCHEDULED');
CREATE TYPE "BackupDestination" AS ENUM ('LOCAL', 'S3', 'BOTH');
CREATE TYPE "BackupRunStatus" AS ENUM ('VERIFIED', 'FAILED');

-- ───── Abonnements (un par cabinet) ─────
CREATE TABLE "billing_subscriptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "plan_code" text NOT NULL,
    "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "seats_extra" integer NOT NULL DEFAULT 0,
    "provider" "BillingProvider" NOT NULL DEFAULT 'SIMULATOR',
    "provider_customer_id" text,
    "provider_subscription_id" text,
    "current_period_start" timestamptz NOT NULL,
    "current_period_end" timestamptz NOT NULL,
    "cancel_at_period_end" boolean NOT NULL DEFAULT false,
    "engine_version" text NOT NULL DEFAULT 'billing-1.0',
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "billing_subscriptions_tenant_key" UNIQUE ("tenant_id")
);

-- ───── Factures ─────
CREATE TABLE "billing_invoices" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "subscription_id" uuid NOT NULL REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE,
    "number" text NOT NULL,
    "plan_code" text NOT NULL,
    "seats_billed" integer NOT NULL DEFAULT 0,
    "amount_cents" integer NOT NULL,
    "currency" text NOT NULL DEFAULT 'CAD',
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'PAID',
    "period_start" timestamptz NOT NULL,
    "period_end" timestamptz NOT NULL,
    "issued_at" timestamptz NOT NULL DEFAULT now(),
    "paid_at" timestamptz,
    "provider_invoice_id" text,
    "lines" jsonb NOT NULL DEFAULT '[]',
    "engine_version" text NOT NULL DEFAULT 'billing-1.0',
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "billing_invoices_number_key" UNIQUE ("number")
);
CREATE INDEX "billing_invoices_tenant_issued" ON "billing_invoices" ("tenant_id", "issued_at");

-- ───── Événements produit (first-party, Loi 25) ─────
CREATE TABLE "product_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "occurred_at" timestamptz NOT NULL DEFAULT now(),
    "app" text NOT NULL,
    "actor_kind" "ProductEventActorKind" NOT NULL,
    "actor_id" uuid,
    "session_hash" text,
    "name" text NOT NULL,
    "props" jsonb NOT NULL DEFAULT '{}',
    "engine_version" text NOT NULL DEFAULT 'analytics-1.0'
);
CREATE INDEX "product_events_tenant_time" ON "product_events" ("tenant_id", "occurred_at");
CREATE INDEX "product_events_name_time" ON "product_events" ("name", "occurred_at");

-- ───── Registre des sauvegardes ─────
CREATE TABLE "backup_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "trigger" "BackupTrigger" NOT NULL DEFAULT 'MANUAL',
    "destination" "BackupDestination" NOT NULL,
    "status" "BackupRunStatus" NOT NULL,
    "started_at" timestamptz NOT NULL,
    "finished_at" timestamptz NOT NULL,
    "blob_count" integer NOT NULL DEFAULT 0,
    "copied_count" integer NOT NULL DEFAULT 0,
    "bytes_total" integer NOT NULL DEFAULT 0,
    "manifest_sha256" text,
    "report" jsonb NOT NULL DEFAULT '{}',
    "error" text,
    "engine_version" text NOT NULL DEFAULT 'backup-1.0',
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "backup_runs_tenant_time" ON "backup_runs" ("tenant_id", "created_at");

-- ───── Photo marketplace → coffre chiffré ─────
ALTER TABLE "advisor_public_profiles" ADD COLUMN "photo_storage_key" text;
ALTER TABLE "advisor_public_profiles" ADD COLUMN "photo_sha256" text;
ALTER TABLE "advisor_public_profiles" ADD COLUMN "photo_size_bytes" integer;
ALTER TABLE "advisor_public_profiles" ADD COLUMN "photo_mime_type" text;
ALTER TABLE "advisor_public_profiles" ADD COLUMN "photo_content_tag" text;

-- ════════ RLS ════════
-- Patron identique à client_links (0019) : confins == membre actif du
-- tenant ; les lectures « staff » excluent les portails (role CLIENT).

ALTER TABLE "billing_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "billing_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "backup_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "backup_runs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "billing_subscriptions_staff_select" ON "billing_subscriptions"
    FOR SELECT USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "billing_subscriptions"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );
CREATE POLICY "billing_subscriptions_staff_insert" ON "billing_subscriptions"
    FOR INSERT WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "billing_subscriptions"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );
CREATE POLICY "billing_subscriptions_staff_update" ON "billing_subscriptions"
    FOR UPDATE USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "billing_subscriptions"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );

CREATE POLICY "billing_invoices_staff_select" ON "billing_invoices"
    FOR SELECT USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "billing_invoices"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );
CREATE POLICY "billing_invoices_staff_insert" ON "billing_invoices"
    FOR INSERT WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "billing_invoices"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );
-- Transitions légitimes OPEN → PAID/VOID (webhook Stripe, ctx système).
CREATE POLICY "billing_invoices_staff_update" ON "billing_invoices"
    FOR UPDATE USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "billing_invoices"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );

-- Événements produit : lecture staff uniquement. Insertion : staff,
-- portail (membre CLIENT du tenant), ou confin public PROUVÉ
-- (annuaire, partage de pièce, jeton de signature externe).
CREATE POLICY "product_events_staff_select" ON "product_events"
    FOR SELECT USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "product_events"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );
CREATE POLICY "product_events_insert" ON "product_events"
    FOR INSERT WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "product_events"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE'
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

CREATE POLICY "backup_runs_staff_select" ON "backup_runs"
    FOR SELECT USING (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "backup_runs"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );
CREATE POLICY "backup_runs_staff_insert" ON "backup_runs"
    FOR INSERT WITH CHECK (
        current_setting('app.tenant_ctx', true) = 'system'
        OR (
            "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            AND EXISTS (
                SELECT 1 FROM "tenant_users" tu
                WHERE tu."tenant_id" = "backup_runs"."tenant_id"
                  AND tu."user_id" = NULLIF(current_setting('app.current_user', true), '')::uuid
                  AND tu."status" = 'ACTIVE' AND tu."role" <> 'CLIENT'
            )
        )
    );

-- ════════ Grants rôle applicatif ════════
GRANT SELECT, INSERT, UPDATE ON "billing_subscriptions" TO coadvisor_app;
GRANT SELECT, INSERT, UPDATE ON "billing_invoices" TO coadvisor_app;
GRANT SELECT, INSERT ON "product_events" TO coadvisor_app;
GRANT SELECT, INSERT ON "backup_runs" TO coadvisor_app;

-- Registres append-only (Loi 25) : événements et comptes rendus de
-- sauvegarde ne se modifient ni ne s'effacent jamais ; les factures
-- ne s'effacent jamais (annulation = statut VOID) ; un abonnement ne
-- se supprime pas (fin = CANCELED).
REVOKE DELETE ON "billing_invoices" FROM coadvisor_app;
REVOKE UPDATE, DELETE ON "product_events" FROM coadvisor_app;
REVOKE UPDATE, DELETE ON "backup_runs" FROM coadvisor_app;
REVOKE DELETE ON "billing_subscriptions" FROM coadvisor_app;
