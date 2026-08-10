"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fieldErrorsFrom, type FormState } from "@/lib/form-state";
import { InvitationStatus } from "@/lib/generated/prisma/enums";
import { generateInvitationToken, generateShortCode } from "@/lib/tokens";
import { guestInputFromFormData } from "@/lib/validators/guest";

function refreshEvent(eventId: string) {
  revalidatePath("/panel");
  revalidatePath(`/panel/eventos/${eventId}`);
}

/**
 * Alta de invitado. Crea también su invitación: el cupo de personas vive en
 * `invitations`, así que un invitado sin invitación sería un invitado sin
 * cantidad de personas permitidas. El QR y el link público se construyen sobre
 * este token en la Fase 3.
 */
export async function createGuestAction(
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const parsed = guestInputFromFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const input = parsed.data;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return { error: "El evento ya no existe." };

  // shortCode es único por evento. Con 32^8 combinaciones el choque es
  // improbable, pero improbable no es imposible: reintentamos en vez de
  // mostrarle un error críptico al usuario.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const guest = await tx.guest.create({
          data: {
            eventId,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            email: input.email,
            notes: input.notes,
          },
          select: { id: true },
        });

        await tx.invitation.create({
          data: {
            guestId: guest.id,
            eventId,
            token: generateInvitationToken(),
            shortCode: generateShortCode(),
            maxPeople: input.maxPeople,
            status: input.status,
          },
        });

        await recordAudit(tx, {
          actorId: user.id,
          action: "guest.create",
          entity: "guest",
          entityId: guest.id,
          payload: {
            eventId,
            name: `${input.firstName} ${input.lastName}`,
            maxPeople: input.maxPeople,
          },
        });
      });

      refreshEvent(eventId);
      return { ok: true };
    } catch (error) {
      const isCodeCollision =
        error instanceof Error && error.message.includes("short_code");
      if (isCodeCollision && attempt < 4) continue;

      console.error("createGuestAction", error);
      return { error: "No se pudo agregar el invitado. Intentá de nuevo." };
    }
  }

  return { error: "No se pudo generar un código único. Intentá de nuevo." };
}

export async function updateGuestAction(
  guestId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const parsed = guestInputFromFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const input = parsed.data;

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      id: true,
      eventId: true,
      invitation: { select: { id: true, enteredCount: true } },
    },
  });

  if (!guest) return { error: "El invitado ya no existe." };

  // Bajar el cupo por debajo de la gente que ya entró violaría el CHECK
  // entered_count <= max_people. Mejor explicarlo que mostrar un error de
  // base de datos.
  const entered = guest.invitation?.enteredCount ?? 0;
  if (input.maxPeople < entered) {
    return {
      fieldErrors: {
        maxPeople: `Ya ingresaron ${entered} personas con esta invitación: no se puede bajar el cupo por debajo de ese número.`,
      },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // select acotado: no usamos la fila de vuelta, y pedir todas las
      // columnas rompe la query ante cualquier desfasaje entre el cliente
      // generado y el esquema real.
      await tx.guest.update({
        where: { id: guestId },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email,
          notes: input.notes,
        },
        select: { id: true },
      });

      if (guest.invitation) {
        await tx.invitation.update({
          where: { id: guest.invitation.id },
          data: { maxPeople: input.maxPeople, status: input.status },
          select: { id: true },
        });
      }

      await recordAudit(tx, {
        actorId: user.id,
        action: "guest.update",
        entity: "guest",
        entityId: guestId,
        payload: {
          name: `${input.firstName} ${input.lastName}`,
          maxPeople: input.maxPeople,
          status: input.status,
        },
      });
    });
  } catch (error) {
    console.error("updateGuestAction", error);
    return { error: "No se pudo guardar el invitado. Intentá de nuevo." };
  }

  refreshEvent(guest.eventId);
  return { ok: true };
}

/** Habilitar / bloquear. Bloquear también invalida el link público. */
export async function setInvitationStatusAction(
  guestId: string,
  status: InvitationStatus,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { eventId: true, invitation: { select: { id: true } } },
  });

  if (!guest?.invitation) return { error: "El invitado no tiene invitación." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: guest.invitation!.id },
        data: {
          status,
          revokedAt:
            status === InvitationStatus.BLOCKED ||
            status === InvitationStatus.CANCELLED
              ? new Date()
              : null,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "invitation.update_status",
        entity: "invitation",
        entityId: guest.invitation!.id,
        payload: { guestId, status },
      });
    });
  } catch (error) {
    console.error("setInvitationStatusAction", error);
    return { error: "No se pudo cambiar el estado." };
  }

  refreshEvent(guest.eventId);
  return { ok: true };
}

/**
 * Baja de invitado.
 *
 * Si ya registró ingresos, se rechaza: borrarlo arrastraría sus check-ins por
 * cascada y el libro de ingresos dejaría de reflejar lo que pasó en la puerta.
 * Para sacar a alguien de circulación está BLOCKED.
 */
export async function deleteGuestAction(guestId: string): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      eventId: true,
      firstName: true,
      lastName: true,
      _count: { select: { checkIns: true } },
    },
  });

  if (!guest) return { error: "El invitado ya no existe." };

  if (guest._count.checkIns > 0) {
    return {
      error:
        "Este invitado ya registró ingresos, así que no se puede eliminar sin borrar el historial. Bloquealo en lugar de eliminarlo.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.guest.delete({ where: { id: guestId } });
      await recordAudit(tx, {
        actorId: user.id,
        action: "guest.delete",
        entity: "guest",
        entityId: guestId,
        payload: {
          eventId: guest.eventId,
          name: `${guest.firstName} ${guest.lastName}`,
        },
      });
    });
  } catch (error) {
    console.error("deleteGuestAction", error);
    return { error: "No se pudo eliminar el invitado." };
  }

  refreshEvent(guest.eventId);
  return { ok: true };
}
