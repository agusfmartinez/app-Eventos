-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'ORGANIZER', 'DOOR');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('WEDDING', 'BIRTHDAY', 'QUINCEANERA', 'CORPORATE', 'PRIVATE', 'OTHER');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ENABLED', 'BLOCKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "role" NOT NULL DEFAULT 'DOOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "event_type" NOT NULL DEFAULT 'OTHER',
    "event_date" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "cover_url" TEXT,
    "notes" TEXT,
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_staff" (
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "station_label" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_staff_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "max_people" INTEGER NOT NULL,
    "entered_count" INTEGER NOT NULL DEFAULT 0,
    "status" "invitation_status" NOT NULL DEFAULT 'ENABLED',
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "people_count" INTEGER NOT NULL,
    "operator_id" UUID,
    "station_label" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "events_event_date_idx" ON "events"("event_date");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "event_staff_user_id_idx" ON "event_staff"("user_id");

-- CreateIndex
CREATE INDEX "guests_event_id_last_name_first_name_idx" ON "guests"("event_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "guests_event_id_phone_idx" ON "guests"("event_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_guest_id_key" ON "invitations"("guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_event_id_status_idx" ON "invitations"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_event_id_short_code_key" ON "invitations"("event_id", "short_code");

-- CreateIndex
CREATE INDEX "check_ins_event_id_created_at_idx" ON "check_ins"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "check_ins_invitation_id_idx" ON "check_ins"("invitation_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- CHECK constraints (agregados a mano: Prisma no los genera)
--
-- Esta es la última red del control de acceso. La transacción de check-in
-- toma un lock de fila y valida antes de incrementar, pero si algún código
-- futuro escribe entered_count por fuera de esa transacción, la base rechaza
-- igual. Nunca se debe superar la cantidad autorizada.
-- ============================================================

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_max_people_positive"
  CHECK ("max_people" > 0);

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_entered_count_not_negative"
  CHECK ("entered_count" >= 0);

-- El constraint que importa.
ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_entered_count_within_max"
  CHECK ("entered_count" <= "max_people");

ALTER TABLE "check_ins"
  ADD CONSTRAINT "check_ins_people_count_positive"
  CHECK ("people_count" > 0);
