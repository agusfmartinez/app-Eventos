import "server-only";

import { prisma } from "@/lib/db";

/**
 * Intervalos de ocupación y detección de solapamientos.
 *
 * Base del calendario de disponibilidad: acá se responde "¿este espacio está
 * libre en esta franja?".
 *
 * ## Por qué se trabaja en minutos y no con Date
 *
 * El evento guarda una fecha (`event_date`, columna DATE) y dos horas como
 * texto `"HH:MM"` en hora del salón. Convertir eso a instantes absolutos
 * obligaría a resolver zona horaria y horario de verano en cada comparación,
 * sin ganar nada: todos los eventos ocurren en el mismo salón, así que
 * comparar tiempo local contra tiempo local da el resultado correcto.
 *
 * Se representa cada momento como minutos desde una época arbitraria. Es
 * exacto, ordenable y no tiene casos borde de zona horaria.
 */

const MINUTES_PER_DAY = 24 * 60;

export type Interval = { start: number; end: number };

export type SchedulableEvent = {
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
};

/** Día calendario de una columna DATE, que Prisma entrega a medianoche UTC. */
function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Franja que ocupa un evento.
 *
 * Dos casos que importan:
 *
 *  - **Termina de madrugada.** Si la hora de fin es menor o igual a la de
 *    inicio, el evento cruza la medianoche: una fiesta de 21:00 a 05:00 ocupa
 *    hasta las 05:00 del día siguiente, y por lo tanto bloquea la mañana
 *    siguiente. Sin esto el sistema ofrecería como libre un sábado a las 09:00
 *    en el que todavía se está desarmando lo del viernes.
 *
 *  - **Sin hora de fin.** Se asume que ocupa hasta el final del día. Es
 *    deliberadamente conservador: para un sistema que avisa de conflictos,
 *    avisar de más es mejor que dejar pasar una doble reserva.
 */
export function eventInterval(event: SchedulableEvent): Interval {
  const base = dayNumber(event.eventDate) * MINUTES_PER_DAY;
  const start = base + (event.startTime ? minutesOfDay(event.startTime) : 0);

  if (!event.endTime) {
    return { start, end: base + MINUTES_PER_DAY };
  }

  let end = base + minutesOfDay(event.endTime);
  if (end <= start) end += MINUTES_PER_DAY;

  return { start, end };
}

/** Dos franjas se pisan si cada una empieza antes de que termine la otra. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export type ScheduleConflict = {
  id: string;
  name: string;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  status: string;
};

/**
 * Eventos del mismo espacio cuya franja se pisa con la indicada.
 *
 * Los cancelados se ignoran: no ocupan nada. Los borradores **sí** cuentan —
 * son las pre-reservas mientras se negocia con el anfitrión, y el sentido de
 * este chequeo es no prometer dos veces la misma fecha.
 */
export async function findScheduleConflicts({
  spaceId,
  event,
  excludeEventId,
}: {
  spaceId: string | null;
  event: SchedulableEvent;
  excludeEventId?: string;
}): Promise<ScheduleConflict[]> {
  // Sin espacio asignado no hay nada que reservar dos veces.
  if (!spaceId) return [];

  const target = eventInterval(event);

  // Se traen los candidatos con un día de margen a cada lado: un evento del
  // día anterior que termina de madrugada puede pisar a este.
  const from = new Date(event.eventDate);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(event.eventDate);
  to.setUTCDate(to.getUTCDate() + 1);

  const candidates = await prisma.event.findMany({
    where: {
      spaceId,
      status: { not: "CANCELLED" },
      eventDate: { gte: from, lte: to },
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    },
    select: {
      id: true,
      name: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  return candidates.filter((candidate) =>
    overlaps(target, eventInterval(candidate)),
  );
}

function formatSpan(conflict: ScheduleConflict): string {
  const d = conflict.eventDate;
  const date = `${String(d.getUTCDate()).padStart(2, "0")}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, "0")}`;

  if (!conflict.startTime) return date;
  if (!conflict.endTime) return `${date} desde las ${conflict.startTime}`;
  return `${date} de ${conflict.startTime} a ${conflict.endTime}`;
}

/**
 * Mensaje de rechazo cuando el espacio ya está ocupado.
 *
 * Dice **con qué** choca, no solo que hay un choque: el organizador está al
 * teléfono con el anfitrión y necesita poder contestar en el momento.
 */
export function describeScheduleConflicts(
  conflicts: ScheduleConflict[],
  spaceName: string,
): string {
  const detail = conflicts
    .map((c) => `${c.name} (${formatSpan(c)}${c.status === "DRAFT" ? ", borrador" : ""})`)
    .join("; ");

  return (
    `El espacio "${spaceName}" ya está ocupado en ese horario por ${detail}. ` +
    `Cambiá la fecha o el horario, elegí otro espacio, o dejalo sin asignar.`
  );
}
