/**
 * Datos del salón que instala cada cliente.
 *
 * La aplicación es un producto estándar: se despliega una copia por cliente y
 * lo que cambia entre uno y otro —nombre y dirección— vive en el entorno, no
 * en la base. Poner esto en una pantalla de configuración sería pedirle al
 * cliente que cargue un dato que ya se decidió al instalarle la app.
 */
export function venueName(): string {
  return process.env.VENUE_NAME?.trim() || "Salón de Eventos";
}

/**
 * Dirección del despliegue. Se expone para poder mostrarla como referencia en
 * el panel: quien edita un espacio tiene que ver qué dirección va a usarse si
 * deja el campo vacío.
 */
export function venueAddress(): string | null {
  return process.env.VENUE_ADDRESS?.trim() || null;
}

/**
 * Dónde se hace un evento, del dato más específico al más general.
 *
 *   1. La dirección del evento, si la cargaron. Es la excepción: un catering
 *      afuera, una sede prestada.
 *   2. La del espacio. Solo se completa cuando el cliente tiene varias sedes y
 *      cada ambiente está en otro lado.
 *   3. La del despliegue. El caso normal: un solo salón, una sola dirección,
 *      cargada una vez y nunca más.
 *
 * Sin la cadena, la dirección habría que reescribirla en cada alta de evento,
 * y cualquier typo termina impreso en la invitación del invitado.
 */
export function resolveLocation(event: {
  location: string | null;
  space?: { address: string | null } | null;
}): string | null {
  return event.location ?? event.space?.address ?? venueAddress();
}
