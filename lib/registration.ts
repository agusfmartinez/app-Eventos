import "server-only";

import { prisma } from "@/lib/db";
import { todayAtVenue } from "@/lib/format";
import { InvitationStatus } from "@/lib/generated/prisma/enums";
import { generateInvitationToken, generateShortCode } from "@/lib/tokens";
import { resolveLocation } from "@/lib/venue";

/**
 * Registro público de invitados.
 *
 * El link del formulario es **un portador**: quien lo tenga puede registrarse,
 * lo haya recibido del anfitrión o de un reenvío. Eso no se puede evitar
 * repartiéndolo con cuidado, así que los controles reales son otros:
 *
 *   - el **cupo del evento**, que acá sí bloquea (en el panel solo avisa: el
 *     organizador tiene contexto para pasarse por dos personas, un formulario
 *     público no),
 *   - el **tope de personas por registro**, para que nadie se anote de a diez,
 *   - la **fecha límite** y poder **cerrarlo** en cualquier momento,
 *   - y que la invitación se pueda bloquear después, con lo que el pase deja
 *     de servir en la puerta.
 *
 * El cupo se verifica dentro de una transacción con lock sobre el evento, por
 * el mismo motivo que el check-in: si el link circula por un grupo de
 * WhatsApp, varios se anotan en el mismo segundo.
 */

export type RegistrationForm = {
  eventId: string;
  eventName: string;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  spaceName: string | null;
  maxPeoplePerGuest: number;
  /** Lugares que todavía quedan, o null si el evento no tiene cupo. */
  remaining: number | null;
  autoApprove: boolean;
};

export type RegistrationClosedReason =
  | "NOT_FOUND"
  | "CLOSED"
  | "EXPIRED"
  | "FULL";

/**
 * Estado del formulario para una visita. Devuelve el motivo del cierre en vez
 * de un booleano: no es lo mismo "se llenó" que "ya pasó la fecha", y la
 * persona que llega tarde merece saber cuál de las dos.
 */
export async function getRegistrationForm(
  token: string,
): Promise<
  { open: true; form: RegistrationForm } | { open: false; reason: RegistrationClosedReason }
> {
  const event = await prisma.event.findUnique({
    where: { registrationToken: token.trim() },
    select: {
      id: true,
      name: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      location: true,
      // Las notas del evento NO se traen: son internas del salón ("el padre
      // de la novia paga en efectivo") y esta pantalla la abre cualquiera que
      // reciba el link.
      status: true,
      maxGuests: true,
      registrationOpen: true,
      registrationDeadline: true,
      registrationMaxPeople: true,
      registrationAutoApprove: true,
      space: { select: { name: true, address: true } },
    },
  });

  if (!event) return { open: false, reason: "NOT_FOUND" };

  // Un evento cancelado o cerrado no recibe gente. Un borrador tampoco: es una
  // negociación, no una fiesta confirmada.
  const liveStatus = event.status === "PUBLISHED" || event.status === "IN_PROGRESS";
  if (!event.registrationOpen || !liveStatus) {
    return { open: false, reason: "CLOSED" };
  }

  if (isExpired(event.registrationDeadline)) {
    return { open: false, reason: "EXPIRED" };
  }

  const remaining = remainingSeats(
    event.maxGuests,
    await countPeople(prisma, event.id),
  );

  if (remaining !== null && remaining <= 0) {
    return { open: false, reason: "FULL" };
  }

  return {
    open: true,
    form: {
      eventId: event.id,
      eventName: event.name,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      location: resolveLocation(event),
      spaceName: event.space?.name ?? null,
      maxPeoplePerGuest: Math.min(
        event.registrationMaxPeople,
        remaining ?? event.registrationMaxPeople,
      ),
      remaining,
      autoApprove: event.registrationAutoApprove,
    },
  };
}

/** La fecha límite es inclusive: el último día todavía se puede registrar. */
function isExpired(deadline: Date | null): boolean {
  if (!deadline) return false;
  return deadline.toISOString().slice(0, 10) < todayAtVenue();
}

/**
 * Personas ya comprometidas: la suma de los cupos de todas las invitaciones,
 * sin importar si las cargó el salón o el formulario.
 *
 * Se cuentan personas y no invitaciones porque es lo que ocupa lugar: una
 * familia de cuatro es un registro y cuatro sillas.
 */
async function countPeople(
  client: Pick<typeof prisma, "invitation">,
  eventId: string,
): Promise<number> {
  const sum = await client.invitation.aggregate({
    where: { eventId, status: { not: InvitationStatus.CANCELLED } },
    _sum: { maxPeople: true },
  });

  return sum._sum.maxPeople ?? 0;
}

/** Lugares que deja el cupo del evento. Null si el evento no tiene cupo. */
function remainingSeats(maxGuests: number | null, taken: number): number | null {
  if (maxGuests === null) return null;
  return Math.max(0, maxGuests - taken);
}

export type RegistrationInput = {
  firstName: string;
  lastName: string;
  document: string;
  phone: string | null;
  people: number;
};

export type RegistrationResult =
  | { ok: true; token: string; pending: boolean }
  /** Ya se había registrado: se le devuelve su entrada en vez de un error. */
  | { ok: true; token: string; pending: boolean; existing: true }
  | { ok: false; reason: RegistrationClosedReason | "TOO_MANY" | "DUPLICATE" | "ERROR" };

/**
 * Alta desde el formulario público.
 *
 * Revalida todo de nuevo aunque la pantalla ya lo haya chequeado: entre que se
 * cargó el formulario y se envió pueden haber pasado horas, y esta función es
 * alcanzable directamente.
 */
export async function registerGuest(
  registrationToken: string,
  input: RegistrationInput,
): Promise<RegistrationResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Lock del evento: serializa los registros concurrentes, que es el
        // escenario real cuando el link cae en un grupo de WhatsApp.
        const rows = await tx.$queryRaw<
          {
            id: string;
            status: string;
            max_guests: number | null;
            registration_open: boolean;
            registration_deadline: Date | null;
            registration_max_people: number;
            registration_auto_approve: boolean;
          }[]
        >`
          SELECT id, status, max_guests, registration_open, registration_deadline,
                 registration_max_people, registration_auto_approve
          FROM events
          WHERE registration_token = ${registrationToken.trim()}
          FOR UPDATE
        `;

        const event = rows[0];
        if (!event) return { ok: false, reason: "NOT_FOUND" } as RegistrationResult;

        const liveStatus =
          event.status === "PUBLISHED" || event.status === "IN_PROGRESS";
        if (!event.registration_open || !liveStatus) {
          return { ok: false, reason: "CLOSED" } as RegistrationResult;
        }

        if (isExpired(event.registration_deadline)) {
          return { ok: false, reason: "EXPIRED" } as RegistrationResult;
        }

        // Si ya se registró con ese DNI, se le devuelve su entrada: perdió el
        // link y volvió a llenar el formulario, que es lo que cualquiera haría.
        const already = await tx.guest.findUnique({
          where: {
            eventId_document: { eventId: event.id, document: input.document },
          },
          select: {
            lastName: true,
            invitation: { select: { token: true, status: true } },
          },
        });

        if (already) {
          const samePerson =
            normalizeName(already.lastName) === normalizeName(input.lastName);

          if (!samePerson || !already.invitation) {
            return { ok: false, reason: "DUPLICATE" } as RegistrationResult;
          }

          return {
            ok: true,
            existing: true,
            token: already.invitation.token,
            pending: already.invitation.status === InvitationStatus.PENDING,
          } as RegistrationResult;
        }

        if (input.people > event.registration_max_people) {
          return { ok: false, reason: "TOO_MANY" } as RegistrationResult;
        }

        const remaining = remainingSeats(
          event.max_guests,
          await countPeople(tx, event.id),
        );

        if (remaining !== null && remaining <= 0) {
          return { ok: false, reason: "FULL" } as RegistrationResult;
        }

        if (remaining !== null && input.people > remaining) {
          return { ok: false, reason: "TOO_MANY" } as RegistrationResult;
        }

        const guest = await tx.guest.create({
          data: {
            eventId: event.id,
            firstName: input.firstName,
            lastName: input.lastName,
            document: input.document,
            phone: input.phone,
            viaRegistration: true,
          },
          select: { id: true },
        });

        const invitation = await tx.invitation.create({
          data: {
            guestId: guest.id,
            eventId: event.id,
            token: generateInvitationToken(),
            shortCode: generateShortCode(),
            maxPeople: input.people,
            status: event.registration_auto_approve
              ? InvitationStatus.ENABLED
              : InvitationStatus.PENDING,
          },
          select: { token: true, status: true },
        });

        return {
          ok: true,
          token: invitation.token,
          pending: invitation.status === InvitationStatus.PENDING,
        } as RegistrationResult;
      });
    } catch (error) {
      // shortCode es único por evento: con 32^8 combinaciones el choque es
      // improbable, pero improbable no es imposible.
      const collision =
        error instanceof Error && error.message.includes("short_code");
      if (collision && attempt < 4) continue;

      console.error("registerGuest", error);
      return { ok: false, reason: "ERROR" };
    }
  }

  return { ok: false, reason: "ERROR" };
}

/**
 * Recupera la entrada de alguien que perdió el link.
 *
 * Pide DNI **y** apellido a propósito: con solo el DNI, el buscador sería un
 * oráculo para probar documentos ajenos. Devuelve siempre el mismo mensaje
 * cuando no encuentra, sin decir cuál de los dos datos falló.
 */
export async function findTicket(
  document: string,
  lastName: string,
): Promise<{ token: string; eventName: string } | null> {
  const guest = await prisma.guest.findFirst({
    where: { document: document.trim(), viaRegistration: true },
    select: {
      lastName: true,
      event: { select: { name: true } },
      invitation: { select: { token: true, revokedAt: true, status: true } },
    },
  });

  if (!guest || !guest.invitation || guest.invitation.revokedAt) return null;
  if (normalizeName(guest.lastName) !== normalizeName(lastName)) return null;
  if (guest.invitation.status === InvitationStatus.CANCELLED) return null;

  return { token: guest.invitation.token, eventName: guest.event.name };
}

/** Compara apellidos como los escribiría una persona: sin acentos ni mayúsculas. */
function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
