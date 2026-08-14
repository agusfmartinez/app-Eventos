/**
 * Construcción de los links de la invitación.
 *
 * APP_URL tiene que apuntar al dominio público real: es lo que se codifica en
 * el QR y lo que recibe el invitado por WhatsApp. Si queda en localhost, los
 * QR generados no funcionan fuera de esta máquina.
 */
function appUrl(): string {
  const raw = process.env.APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function invitationUrl(token: string): string {
  return `${appUrl()}/i/${token}`;
}

export function invitationImageUrl(token: string): string {
  return `${appUrl()}/i/${token}/imagen`;
}

/** Formulario público de registro (Fase 10). Lo comparte el anfitrión. */
export function registrationUrl(token: string): string {
  return `${appUrl()}/r/${token}`;
}

/**
 * Link wa.me con el mensaje prearmado. El envío es manual: se abre WhatsApp
 * con el texto listo y la persona aprieta enviar. Automatizarlo requiere
 * WhatsApp Business API (Fase 8).
 */
export function whatsappLink({
  phone,
  guestName,
  eventName,
  dateLabel,
  timeLabel,
  location,
  maxPeople,
  token,
}: {
  phone: string | null;
  guestName: string;
  eventName: string;
  dateLabel: string;
  timeLabel: string | null;
  location: string | null;
  maxPeople: number;
  token: string;
}): string {
  const lines = [
    `*${eventName}*`,
    "",
    `Hola ${guestName}, te esperamos.`,
    "",
    `📅 ${dateLabel}${timeLabel ? ` · ${timeLabel} hs` : ""}`,
    location ? `📍 ${location}` : null,
    `👥 ${maxPeople} ${maxPeople === 1 ? "persona" : "personas"}`,
    "",
    "Tu invitación con el código QR:",
    invitationUrl(token),
    "",
    "Mostrala en el ingreso.",
  ].filter((line) => line !== null);

  const text = encodeURIComponent(lines.join("\n"));

  // Sin teléfono, wa.me sin número abre el selector de contacto de WhatsApp.
  return phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;
}
