"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/authz";
import {
  confirmCheckIn,
  extractToken,
  lookupInvitationAmong,
  type CheckInResult,
  type ScannedEvent,
} from "@/lib/checkin";
import { resolveShortCodeAmong, scannableEventIds } from "@/lib/scanning";
import { getAssignedStation } from "@/lib/staff";

/**
 * Acciones del control de acceso.
 *
 * El operador no elige evento: lo determina el QR. La autorización, entonces,
 * no puede ser "¿podés entrar a esta pantalla?" sino "¿este token pertenece a
 * un evento que está corriendo ahora y que vos podés atender?". Esa pregunta
 * la contesta `scannableEventIds`, y toda acción de acá la vuelve a hacer:
 * son endpoints invocables directamente, sin pasar por ninguna pantalla.
 */

export type ScanOutcome = {
  result: CheckInResult;
  /** Evento del token, aunque el resultado sea un rechazo. */
  event: ScannedEvent | null;
};

/** Consulta previa: muestra el resultado sin registrar nada. */
export async function scanLookupAction(scanned: string): Promise<ScanOutcome> {
  const user = await requireAuth();
  const allowed = await scannableEventIds(user);

  return lookupInvitationAmong(extractToken(scanned), allowed);
}

/** Registra el ingreso. Revalida todo desde cero dentro de la transacción. */
export async function confirmCheckInAction(
  scanned: string,
  people: number,
): Promise<ScanOutcome> {
  const user = await requireAuth();

  const code = extractToken(scanned);
  const allowed = await scannableEventIds(user);

  // Se vuelve a evaluar en vez de confiar en la consulta previa: entre que el
  // operador vio el sello y tocó confirmar pudo cambiar cualquier cosa.
  const { result, event } = await lookupInvitationAmong(code, allowed);
  if (result.result !== "ALLOWED" || !event) return { result, event };

  const confirmed = await confirmCheckIn({
    code,
    eventId: event.id,
    people,
    operatorId: user.id,
    // El puesto sale de la asignación al evento, no del cliente.
    stationLabel: await getAssignedStation(event.id, user.id),
  });

  if (confirmed.result === "OK") {
    revalidatePath(`/panel/eventos/${event.id}`);
    revalidatePath(`/control/${event.id}`);
  }

  return { result: confirmed, event };
}

/**
 * Respaldo manual: convierte el código corto en el token del QR.
 *
 * El código corto solo es único dentro de un evento, así que con varias
 * fiestas la misma noche puede repetirse. Cuando pasa, se avisa en vez de
 * elegir uno al azar: registrar el ingreso de otra persona sería peor que
 * pedirle el QR.
 */
export async function resolveShortCodeAction(
  shortCode: string,
): Promise<{ token: string } | { error: string }> {
  const user = await requireAuth();
  const allowed = await scannableEventIds(user);

  const match = await resolveShortCodeAmong(shortCode, allowed);

  if (match.kind === "found") return { token: match.token };

  if (match.kind === "ambiguous") {
    return {
      error: `Ese código existe en ${match.events.join(" y ")}. Pedile el QR a la persona.`,
    };
  }

  return {
    error: "No encontramos ninguna invitación con ese código en los eventos de hoy.",
  };
}
