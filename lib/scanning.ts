import "server-only";

import type { CurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import {
  currentVenueDay,
  dateOfDayNumber,
  dayNumberOfInterval,
  eventInterval,
  overlaps,
} from "@/lib/schedule";

/**
 * Qué eventos se pueden escanear ahora mismo.
 *
 * El escaneo libre invierte el flujo: el operador no elige evento, el QR lo
 * determina. Pero entonces alguien tiene que decidir contra qué eventos vale
 * un token, y esa decisión vive acá.
 */

/**
 * Eventos abiertos para escanear en este momento.
 *
 * La ventana es la jornada del salón —de 08:00 a 08:00, ver `currentVenueDay`—
 * y no el día calendario. Una fiesta del 15 que termina 05:00 del 16 sigue
 * abierta a las 03:00 del 16: filtrar por `event_date = hoy` dejaría al
 * operador sin escanear justo en la madrugada.
 *
 * Los borradores quedan afuera: un evento que todavía se está negociando no
 * debería poder recibir gente. Los cancelados y finalizados, tampoco.
 */
export async function listScannableEvents(
  user: CurrentUser,
  now: Date = new Date(),
) {
  const window = currentVenueDay(now);
  const day = dayNumberOfInterval(window);

  // Un día de margen a cada lado: la jornada de hoy contiene la madrugada de
  // mañana, y puede haber arrancado con un evento fechado ayer.
  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "IN_PROGRESS"] },
      eventDate: { gte: dateOfDayNumber(day - 1), lte: dateOfDayNumber(day + 1) },
      // Recepción solo alcanza los eventos donde está asignada. Admins y
      // organizadores, todos.
      ...(user.role === Role.DOOR ? { staff: { some: { userId: user.id } } } : {}),
    },
    orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      name: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      status: true,
      space: { select: { name: true } },
      _count: { select: { guests: true } },
    },
  });

  return events
    .filter((event) => overlaps(window, eventInterval(event)))
    .map((event) => ({
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      status: event.status,
      spaceName: event.space?.name ?? null,
      guestCount: event._count.guests,
    }));
}

export type ScannableEvent = Awaited<
  ReturnType<typeof listScannableEvents>
>[number];

/**
 * Eventos que el operador puede consultar, no solo los que están abiertos.
 *
 * Es la lista del menú: sirve para buscar a alguien en la fiesta de mañana o
 * revisar la de anoche. Arranca en ayer porque a la madrugada "lo de anoche"
 * todavía es el evento en curso.
 */
export async function listAccessibleEvents(
  user: CurrentUser,
  now: Date = new Date(),
) {
  const day = dayNumberOfInterval(currentVenueDay(now));

  const isStaff = user.role === Role.DOOR;

  const events = await prisma.event.findMany({
    where: {
      eventDate: { gte: dateOfDayNumber(day - 1) },
      // Recepción no ve borradores ni cancelados: son estados de gestión.
      status: isStaff
        ? { in: ["PUBLISHED", "IN_PROGRESS", "FINISHED"] }
        : { not: "CANCELLED" },
      ...(isStaff ? { staff: { some: { userId: user.id } } } : {}),
    },
    orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      name: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      status: true,
      space: { select: { name: true } },
      _count: { select: { guests: true } },
    },
  });

  const open = new Set(
    (await listScannableEvents(user, now)).map((event) => event.id),
  );

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    eventDate: event.eventDate,
    startTime: event.startTime,
    endTime: event.endTime,
    status: event.status,
    spaceName: event.space?.name ?? null,
    guestCount: event._count.guests,
    /** Se está atendiendo ahora: el QR de este evento se puede escanear. */
    open: open.has(event.id),
  }));
}

export type AccessibleEvent = Awaited<
  ReturnType<typeof listAccessibleEvents>
>[number];

/** Ids de los eventos escaneables, que es lo que necesita la validación. */
export async function scannableEventIds(
  user: CurrentUser,
  now: Date = new Date(),
): Promise<Set<string>> {
  const events = await listScannableEvents(user, now);
  return new Set(events.map((event) => event.id));
}

/**
 * Busca un código corto entre los eventos abiertos.
 *
 * El código corto no es único global —solo dentro de un evento—, así que en el
 * escaneo libre puede haber empate. Se distingue "no existe" de "existe en
 * varios": el segundo caso no es un error del operador y necesita otra
 * respuesta.
 */
export async function resolveShortCodeAmong(
  shortCode: string,
  eventIds: ReadonlySet<string>,
): Promise<
  | { kind: "found"; token: string }
  | { kind: "none" }
  | { kind: "ambiguous"; events: string[] }
> {
  const normalized = shortCode.trim().toUpperCase();
  if (!normalized || eventIds.size === 0) return { kind: "none" };

  const matches = await prisma.invitation.findMany({
    where: { shortCode: normalized, eventId: { in: [...eventIds] } },
    select: { token: true, event: { select: { name: true } } },
  });

  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "found", token: matches[0].token };

  return { kind: "ambiguous", events: matches.map((m) => m.event.name) };
}
