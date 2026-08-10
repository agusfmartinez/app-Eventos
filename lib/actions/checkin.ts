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
  stationLabel: string | null,
): Promise<CheckInResult> {
  const user = await requireEventAccess(eventId);

  const result = await confirmCheckIn({
    code: extractToken(scanned),
    eventId,
    people,
    operatorId: user.id,
    // Etiqueta libre del puesto ("Puerta 1"). Se acota para que nadie meta
    // media novela en el historial.
    stationLabel: stationLabel?.trim().slice(0, 60) || null,
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
