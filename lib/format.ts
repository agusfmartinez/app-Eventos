import { EventStatus } from "@/lib/generated/prisma/enums";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Las fechas de evento son columnas DATE. Prisma las entrega como Date a
 * medianoche UTC, así que hay que leerlas en UTC: usar getDate() local
 * correría la fecha un día hacia atrás en Argentina (UTC-3).
 */
export function formatEventDate(date: Date): string {
  return `${date.getUTCDate()} de ${MESES[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

export function formatEventDateShort(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

/** Para prellenar un <input type="date">, que espera "YYYY-MM-DD". */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * "Hoy" es hoy en el salón, no en UTC ni en la zona del servidor.
 * A las 22:00 de Argentina ya es el día siguiente en UTC: sin esto, el evento
 * de esta noche aparecería como "pasado" justo cuando más se lo mira.
 */
export function todayAtVenue(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  IN_PROGRESS: "En curso",
  FINISHED: "Finalizado",
  CANCELLED: "Cancelado",
};

export function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  // Solo agrupa para que se lea; no intenta interpretar prefijos.
  if (phone.length >= 10) {
    return `${phone.slice(0, 2)} ${phone.slice(2, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

export function guestFullName(guest: {
  firstName: string;
  lastName: string;
}): string {
  return `${guest.firstName} ${guest.lastName}`.trim();
}
