-- La dirección deja de escribirse evento por evento.
--
-- Se resuelve en cadena: la del evento (excepción), la del espacio (varias
-- sedes) o la del despliegue en VENUE_ADDRESS (el caso normal, un solo salón).
ALTER TABLE "spaces" ADD COLUMN "address" TEXT;
