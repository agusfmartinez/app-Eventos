-- Fase 10: formulario público de registro de invitados.

-- Controles del formulario, en el evento.
ALTER TABLE "events"
  ADD COLUMN "registration_token" TEXT,
  ADD COLUMN "registration_open" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "registration_deadline" DATE,
  ADD COLUMN "registration_max_people" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "registration_limit" INTEGER,
  ADD COLUMN "registration_auto_approve" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "events_registration_token_key"
  ON "events"("registration_token");

-- Los topes no tienen sentido en cero o negativos, y son los que frenan un
-- registro masivo: si alguien los deja mal, el formulario deja de proteger.
ALTER TABLE "events"
  ADD CONSTRAINT "events_registration_max_people_check"
  CHECK ("registration_max_people" >= 1);

ALTER TABLE "events"
  ADD CONSTRAINT "events_registration_limit_check"
  CHECK ("registration_limit" IS NULL OR "registration_limit" >= 0);

-- DNI y origen del invitado.
ALTER TABLE "guests"
  ADD COLUMN "document" VARCHAR(20),
  ADD COLUMN "via_registration" BOOLEAN NOT NULL DEFAULT false;

-- Un DNI por evento. Postgres permite varios NULL en un índice único, así que
-- los invitados cargados a mano —que no tienen DNI— no se estorban entre sí.
CREATE UNIQUE INDEX "guests_event_id_document_key"
  ON "guests"("event_id", "document");
