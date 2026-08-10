-- Se elimina el tipo de evento.
--
-- El campo solo pintaba una etiqueta en el panel: no filtraba, no agrupaba y
-- no cambiaba ningún comportamiento. Además el formulario venía con
-- "Casamiento" por defecto mientras la base usaba OTHER, así que un evento
-- creado sin tocar el desplegable quedaba mal etiquetado.
--
-- Si más adelante la invitación necesita mostrar el tipo, volver a agregarlo
-- es una migración chica.

ALTER TABLE "events" DROP COLUMN "type";

DROP TYPE "event_type";
