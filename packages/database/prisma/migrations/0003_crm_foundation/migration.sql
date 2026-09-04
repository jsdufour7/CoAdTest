-- ─────────────────────────────────────────────────────────────
-- CoAdvisor Sprint 2 — CRM Financial Foundation
-- clients, membres de famille, timeline (Financial Life OS),
-- notes, tâches — toutes les tables portent tenant_id (RLS directe).
-- ─────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'FAMILY', 'CORPORATE');
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "HouseholdRole" AS ENUM ('SPOUSE', 'CHILD', 'PARENT', 'DEPENDENT', 'OTHER');
CREATE TYPE "TimelineEventType" AS ENUM ('LIFE_EVENT', 'FINANCIAL_EVENT', 'MEETING', 'COMPLIANCE', 'DOCUMENT', 'GOAL');
CREATE TYPE "TimelineEventSource" AS ENUM ('MANUAL', 'SYSTEM', 'IMPORT');
CREATE TYPE "NoteType" AS ENUM ('MEETING', 'PHONE', 'EMAIL', 'OBSERVATION', 'TASK');
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- Table "clients"
CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "advisor_id" UUID NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'INDIVIDUAL',
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "birth_date" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "clients_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "clients_tenant_id_status_idx" ON "clients"("tenant_id", "status");
CREATE INDEX "clients_tenant_id_last_name_idx" ON "clients"("tenant_id", "last_name");
CREATE INDEX "clients_advisor_id_idx" ON "clients"("advisor_id");

-- Table "family_members"
CREATE TABLE "family_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL,
    "birth_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "family_members_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "family_members_tenant_id_idx" ON "family_members"("tenant_id");
CREATE INDEX "family_members_client_id_idx" ON "family_members"("client_id");

-- Table "timeline_events"
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "event_type" "TimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "TimelineEventSource" NOT NULL DEFAULT 'MANUAL',
    "created_by" UUID,
    "ai_context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timeline_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "timeline_events_tenant_id_idx" ON "timeline_events"("tenant_id");
CREATE INDEX "timeline_events_client_id_event_date_idx" ON "timeline_events"("client_id", "event_date");

-- Table "notes"
CREATE TABLE "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "type" "NoteType" NOT NULL DEFAULT 'OBSERVATION',
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "notes_tenant_id_idx" ON "notes"("tenant_id");
CREATE INDEX "notes_client_id_created_at_idx" ON "notes"("client_id", "created_at");

-- Table "tasks"
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "assigned_to" UUID,
    "created_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tasks_tenant_id_status_idx" ON "tasks"("tenant_id", "status");
CREATE INDEX "tasks_client_id_idx" ON "tasks"("client_id");
