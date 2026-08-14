-- El default pasa de 4 a 1: sumar acompañantes tiene que ser una decisión
-- explícita del salón, no algo que el formulario conceda solo.
ALTER TABLE "events"
  ALTER COLUMN "registration_max_people" SET DEFAULT 1;

-- Los eventos existentes también: la funcionalidad es nueva y ninguno llegó a
-- usarse, así que dejarlos en 4 sería arrastrar un default que ya se descartó.
UPDATE "events" SET "registration_max_people" = 1
WHERE "registration_max_people" = 4 AND "registration_token" IS NULL;
