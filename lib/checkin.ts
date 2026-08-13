import "server-only";

import { prisma } from "@/lib/db";
import { InvitationStatus } from "@/lib/generated/prisma/enums";

/**
 * Validación y registro de ingresos.
 *
 * Este archivo es el punto más delicado del sistema. Varios teléfonos escanean
 * a la vez en la puerta, y la regla es que NUNCA se supere la cantidad de
 * personas autorizadas por una invitación.
 *
 * Tres capas de defensa:
 *
 *   1. `SELECT ... FOR UPDATE` dentro de una transacción interactiva: dos
 *      operadores que escanean el mismo QR se serializan. El segundo espera al
 *      commit del primero y recién ahí lee el contador, ya actualizado.
 *   2. `CHECK (entered_count <= max_people)` en la base (migración inicial):
 *      si algún código futuro escribe el contador por fuera de acá, Postgres
 *      lo rechaza igual.
 *   3. Toda decisión ocurre en el servidor. El cliente solo dibuja el
 *      resultado; un navegador manipulado no puede autorizar nada.
 *
 * NUNCA modificar `enteredCount` fuera de `confirmCheckIn`.
 */

/**
 * El QR codifica la URL pública completa (`https://dominio/i/<token>`), no el
 * token pelado: así, si alguien lo escanea con la cámara del celular en vez de
 * con la app, le abre la invitación en el navegador.
 *
 * Acepta también un token suelto, por si en el futuro se generan QR de otra
 * forma o alguien pega el valor a mano.
 */
export function extractToken(scanned: string): string {
  const text = scanned.trim();

  const match = text.match(/\/i\/([A-Za-z0-9_-]+)\/?$/);
  if (match) return match[1];

  return text;
}

export type CheckInResult =
  /** Se registró el ingreso. */
  | {
      result: "OK";
      guestName: string;
      peopleEntered: number;
      enteredCount: number;
      maxPeople: number;
    }
  /** La invitación existe y puede entrar. Todavía no se registró nada. */
  | {
      result: "ALLOWED";
      guestName: string;
      maxPeople: number;
      enteredCount: number;
      available: number;
    }
  | { result: "NOT_FOUND" }
  | { result: "BLOCKED"; guestName: string }
  | { result: "PENDING"; guestName: string }
  | { result: "WRONG_EVENT"; guestName: string; eventName: string }
  | {
      result: "EXHAUSTED";
      guestName: string;
      maxPeople: number;
      enteredCount: number;
    }
  | { result: "TOO_MANY"; guestName: string; available: number };

const invitationSelect = {
  id: true,
  status: true,
  maxPeople: true,
  enteredCount: true,
  eventId: true,
  guestId: true,
  guest: { select: { firstName: true, lastName: true } },
  event: { select: { name: true, space: { select: { name: true } } } },
} as const;

type InvitationForCheckIn = {
  status: InvitationStatus;
  maxPeople: number;
  enteredCount: number;
  eventId: string;
  guest: { firstName: string; lastName: string };
  event: { name: string; space: { name: string } | null };
};

/**
 * Reglas de admisión, en el orden en que importan.
 *
 * Es una función pura para que la consulta previa y el registro definitivo
 * apliquen exactamente el mismo criterio: si divergieran, el operador vería
 * "autorizado" y al confirmar recibiría un rechazo.
 */
function evaluate(
  invitation: InvitationForCheckIn,
  /**
   * Qué eventos acepta este escaneo. Con evento fijo es uno solo; en el
   * escaneo libre son los que están corriendo ahora y el operador alcanza.
   */
  accepts: (eventId: string) => boolean,
): Exclude<CheckInResult, { result: "OK" }> {
  const guestName = `${invitation.guest.firstName} ${invitation.guest.lastName}`;

  // El evento va primero: una invitación de otra fiesta no es "bloqueada",
  // es de otra fiesta, y el operador necesita ese mensaje concreto.
  if (!accepts(invitation.eventId)) {
    return { result: "WRONG_EVENT", guestName, eventName: invitation.event.name };
  }

  if (
    invitation.status === InvitationStatus.BLOCKED ||
    invitation.status === InvitationStatus.CANCELLED
  ) {
    return { result: "BLOCKED", guestName };
  }

  if (invitation.status === InvitationStatus.PENDING) {
    return { result: "PENDING", guestName };
  }

  const available = invitation.maxPeople - invitation.enteredCount;
  if (available <= 0) {
    return {
      result: "EXHAUSTED",
      guestName,
      maxPeople: invitation.maxPeople,
      enteredCount: invitation.enteredCount,
    };
  }

  return {
    result: "ALLOWED",
    guestName,
    maxPeople: invitation.maxPeople,
    enteredCount: invitation.enteredCount,
    available,
  };
}

/**
 * Consulta previa, SOLO LECTURA. Es lo que se muestra apenas se escanea.
 *
 * No toma lock ni decide nada definitivo: entre esta consulta y la
 * confirmación el estado puede cambiar. No importa — `confirmCheckIn`
 * revalida todo desde cero.
 */
export async function lookupInvitation(
  code: string,
  eventId: string,
): Promise<CheckInResult> {
  const { result } = await lookupInvitationAmong(code, new Set([eventId]));
  return result;
}

/**
 * Igual que `lookupInvitation`, pero contra varios eventos, y además devuelve
 * a cuál pertenece el token.
 *
 * Es la consulta del escaneo libre: el token ya identifica al evento, así que
 * lo único que queda por decidir es si ese evento es uno de los que el
 * operador puede atender ahora. El evento se devuelve incluso cuando el
 * resultado es un rechazo — el operador necesita saber de qué fiesta era.
 */
export async function lookupInvitationAmong(
  code: string,
  eventIds: ReadonlySet<string>,
): Promise<{ result: CheckInResult; event: ScannedEvent | null }> {
  const invitation = await findByCode(code);
  if (!invitation) return { result: { result: "NOT_FOUND" }, event: null };

  return {
    result: evaluate(invitation, (id) => eventIds.has(id)),
    event: {
      id: invitation.eventId,
      name: invitation.event.name,
      spaceName: invitation.event.space?.name ?? null,
    },
  };
}

export type ScannedEvent = {
  id: string;
  name: string;
  /** Sub-salón del evento. Es a dónde hay que mandar al invitado. */
  spaceName: string | null;
};

async function findByCode(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return null;

  // El QR trae el token. El código corto es el respaldo que se tipea a mano,
  // y no es único global: solo dentro de un evento.
  const byToken = await prisma.invitation.findUnique({
    where: { token: trimmed },
    select: invitationSelect,
  });

  return byToken;
}

/**
 * Registra el ingreso. Esta es la operación que tiene que ser atómica.
 */
export async function confirmCheckIn({
  code,
  eventId,
  people,
  operatorId,
  stationLabel,
}: {
  code: string;
  eventId: string;
  people: number;
  operatorId: string;
  stationLabel: string | null;
}): Promise<CheckInResult> {
  if (!Number.isInteger(people) || people < 1) {
    return { result: "TOO_MANY", guestName: "", available: 0 };
  }

  return prisma.$transaction(
    async (tx) => {
      // Lock pesimista. Otro scanner con el mismo token espera acá hasta el
      // commit; después lee el contador ya incrementado.
      const rows = await tx.$queryRaw<
        {
          id: string;
          status: InvitationStatus;
          max_people: number;
          entered_count: number;
          event_id: string;
          guest_id: string;
        }[]
      >`
        SELECT id, status, max_people, entered_count, event_id, guest_id
        FROM invitations
        WHERE token = ${code.trim()}
        FOR UPDATE
      `;

      const locked = rows[0];
      if (!locked) return { result: "NOT_FOUND" } as CheckInResult;

      // Nombres para los mensajes. Van después del lock a propósito: primero
      // asegurar la fila, después adornar.
      const details = await tx.invitation.findUnique({
        where: { id: locked.id },
        select: {
          guest: { select: { firstName: true, lastName: true } },
          event: { select: { name: true, space: { select: { name: true } } } },
        },
      });

      const invitation: InvitationForCheckIn = {
        status: locked.status,
        maxPeople: locked.max_people,
        enteredCount: locked.entered_count,
        eventId: locked.event_id,
        guest: details?.guest ?? { firstName: "", lastName: "" },
        event: details?.event ?? { name: "", space: null },
      };

      const verdict = evaluate(invitation, (id) => id === eventId);
      if (verdict.result !== "ALLOWED") return verdict;

      if (people > verdict.available) {
        return {
          result: "TOO_MANY",
          guestName: verdict.guestName,
          available: verdict.available,
        } as CheckInResult;
      }

      const updated = await tx.invitation.update({
        where: { id: locked.id },
        data: { enteredCount: { increment: people } },
        select: { enteredCount: true, maxPeople: true },
      });

      await tx.checkIn.create({
        data: {
          invitationId: locked.id,
          guestId: locked.guest_id,
          eventId: locked.event_id,
          peopleCount: people,
          operatorId,
          stationLabel,
        },
        select: { id: true },
      });

      return {
        result: "OK",
        guestName: verdict.guestName,
        peopleEntered: people,
        enteredCount: updated.enteredCount,
        maxPeople: updated.maxPeople,
      } as CheckInResult;
    },
    {
      // Si el cliente se cae a mitad, el lock no queda colgado bloqueando la
      // puerta entera.
      timeout: 10_000,
    },
  );
}

// El respaldo por código corto vive en `lib/scanning.ts`: con el escaneo libre
// hay que buscarlo entre varios eventos, porque solo es único dentro de uno.
