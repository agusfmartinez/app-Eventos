import "server-only";

import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * Consultas de personal asignado a eventos.
 *
 * Van acá y no en `lib/actions/event-staff.ts` a propósito: todo lo que se
 * exporta desde un archivo `"use server"` queda expuesto como endpoint HTTP
 * invocable. Una función que devuelve la lista de cuentas del personal no
 * tiene por qué ser alcanzable desde afuera, así que vive en un módulo de
 * servidor común, que solo pueden importar los componentes del servidor.
 */

/**
 * Candidatos para asignar a la puerta de un evento.
 *
 * Se ofrecen las cuentas de recepción activas que todavía no están asignadas.
 * Los admins y organizadores no aparecen: ya pueden escanear en cualquier
 * evento sin asignación previa.
 */
export async function listAssignableStaff(eventId: string) {
  const users = await prisma.user.findMany({
    where: {
      role: Role.DOOR,
      active: true,
      staffAt: { none: { eventId } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, username: true, firstName: true, lastName: true },
  });

  return users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: `${u.firstName} ${u.lastName}`,
  }));
}

/**
 * Puesto con el que quedó asignada una persona a un evento ("Puerta 1").
 *
 * Lo define quien arma el evento, no quien escanea: es el dato que después
 * explica el historial de ingresos. Devuelve null para admins y organizadores,
 * que escanean sin asignación.
 */
export async function getAssignedStation(
  eventId: string,
  userId: string,
): Promise<string | null> {
  const row = await prisma.eventStaff.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { stationLabel: true },
  });

  return row?.stationLabel ?? null;
}

export async function listEventStaff(eventId: string) {
  const rows = await prisma.eventStaff.findMany({
    where: { eventId },
    orderBy: { user: { lastName: "asc" } },
    select: {
      userId: true,
      stationLabel: true,
      user: {
        select: {
          username: true,
          firstName: true,
          lastName: true,
          active: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    userId: r.userId,
    stationLabel: r.stationLabel,
    username: r.user.username,
    fullName: `${r.user.firstName} ${r.user.lastName}`,
    active: r.user.active,
  }));
}
