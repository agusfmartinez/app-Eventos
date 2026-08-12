"use server";

import { revalidatePath } from "next/cache";

import { requireEventAccess } from "@/lib/authz";
import {
  confirmCheckIn,
  extractToken,
  lookupInvitation,
  resolveShortCode,
  type CheckInResult,
} from "@/lib/checkin";
import { getAssignedStation } from "@/lib/staff";

/**
 * Toda acción del scanner arranca con requireEventAccess: un operador del rol
 * DOOR solo puede registrar ingresos en los eventos donde está asignado. El
 * guard de la página no alcanza — estas acciones son endpoints invocables
 * directamente.
 */

/** Consulta previa: muestra el resultado sin registrar nada. */
export async function scanLookupAction(
  eventId: string,
  scanned: string,
): Promise<CheckInResult> {
  await requireEventAccess(eventId);
  return lookupInvitation(extractToken(scanned), eventId);
}

/** Registra el ingreso. Revalida todo desde cero dentro de la transacción. */
export async function confirmCheckInAction(
  eventId: string,
  scanned: string,
  people: number,
): Promise<CheckInResult> {
  const user = await requireEventAccess(eventId);

  const result = await confirmCheckIn({
    code: extractToken(scanned),
    eventId,
    people,
    operatorId: user.id,
    // El puesto sale de la asignación del evento, no de lo que mande el
    // cliente: es un dato del historial y quien escanea no lo elige.
    stationLabel: await getAssignedStation(eventId, user.id),
  });

  if (result.result === "OK") {
    revalidatePath(`/panel/eventos/${eventId}`);
  }

  return result;
}

/** Respaldo manual: convierte el código corto en el token del QR. */
export async function resolveShortCodeAction(
  eventId: string,
  shortCode: string,
): Promise<{ token: string } | { error: string }> {
  await requireEventAccess(eventId);

  const token = await resolveShortCode(shortCode, eventId);
  if (!token) {
    return { error: "No encontramos ninguna invitación con ese código." };
  }

  return { token };
}
