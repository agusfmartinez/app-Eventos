-- El tope de registros contaba formularios completados, no personas, así que
-- no respondía la pregunta que importa: cuánta gente entra. El cupo del evento
-- (max_guests) ya la responde, y en la unidad correcta.
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_registration_limit_check";
ALTER TABLE "events" DROP COLUMN IF EXISTS "registration_limit";
