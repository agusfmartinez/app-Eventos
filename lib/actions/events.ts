"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { requireAdmin, requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  collectValues,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/form-state";
import { EventStatus } from "@/lib/generated/prisma/enums";
import {
  describeScheduleConflicts,
  findScheduleConflicts,
} from "@/lib/schedule";
import {
  eventInputFromFormData,
  parseEventDate,
  type EventInput,
} from "@/lib/validators/event";

/**
 * Cada acción abre con requireAuth: son endpoints HTTP que se pueden invocar
 * directamente, sin pasar por la página que las expone. Proteger solo el
 * layout no alcanza.
 */

/**
 * Rechaza guardar si el espacio ya está ocupado en ese horario.
 *
 * Dos fiestas en el mismo ambiente a la misma hora es un error de carga, no
 * una situación válida: si el salón se divide, eso se modela como espacios
 * distintos. Se bloquea en vez de avisar porque un aviso posterior llega tarde
 * — el organizador ya le prometió la fecha al anfitrión.
 *
 * Se valida acá, en la acción, y no solo en el formulario: la acción es un
 * endpoint invocable directamente.
 */
async function scheduleBlocker(
  input: EventInput,
  excludeEventId?: string,
): Promise<string | null> {
  // Un evento cancelado no ocupa nada, así que tampoco puede chocar.
  if (!input.spaceId || input.status === EventStatus.CANCELLED) return null;

  const candidate = {
    eventDate: parseEventDate(input.eventDate),
    startTime: input.startTime,
    endTime: input.endTime,
  };

  const conflicts = await findScheduleConflicts({
    spaceId: input.spaceId,
    event: candidate,
    excludeEventId,
  });

  if (conflicts.length === 0) return null;

  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: { name: true },
  });

  return describeScheduleConflicts(conflicts, space?.name ?? "seleccionado");
}

export async function createEventAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const parsed = eventInputFromFormData(formData);
  if (!parsed.success) {
    return { values: collectValues(formData), fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const input = parsed.data;

  const blocked = await scheduleBlocker(input);
  if (blocked) return { values: collectValues(formData), error: blocked };

  let eventId: string;

  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          name: input.name,
          eventDate: parseEventDate(input.eventDate),
          startTime: input.startTime,
          endTime: input.endTime,
          notes: input.notes,
          status: input.status,
          spaceId: input.spaceId,
          maxGuests: input.maxGuests,
          createdById: user.id,
        },
        select: { id: true, name: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "event.create",
        entity: "event",
        entityId: created.id,
        payload: { name: created.name },
      });

      return created;
    });

    eventId = event.id;
  } catch (error) {
    console.error("createEventAction", error);
    return { values: collectValues(formData), error: "No se pudo crear el evento. Intentá de nuevo." };
  }

  revalidatePath("/panel");
  // Fuera del try: redirect() funciona lanzando una excepción, y atraparla
  // haría que el formulario nunca navegue.
  redirect(`/panel/eventos/${eventId}`);
}

export async function updateEventAction(
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const parsed = eventInputFromFormData(formData);
  if (!parsed.success) {
    return { values: collectValues(formData), fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const input = parsed.data;

  // Se excluye a sí mismo: un evento no choca consigo mismo al editarlo.
  const blocked = await scheduleBlocker(input, eventId);
  if (blocked) return { values: collectValues(formData), error: blocked };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          name: input.name,
          eventDate: parseEventDate(input.eventDate),
          startTime: input.startTime,
          endTime: input.endTime,
          notes: input.notes,
          status: input.status,
          spaceId: input.spaceId,
          maxGuests: input.maxGuests,
        },
        // No necesitamos la fila de vuelta. Sin select, Prisma pide todas las
        // columnas y la query se rompe ante cualquier desfasaje entre el
        // cliente generado y el esquema real.
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "event.update",
        entity: "event",
        entityId: eventId,
        payload: { name: input.name, status: input.status },
      });
    });
  } catch (error) {
    console.error("updateEventAction", error);
    return { values: collectValues(formData), error: "No se pudo guardar el evento. Intentá de nuevo." };
  }

  revalidatePath("/panel");
  revalidatePath(`/panel/eventos/${eventId}`);
  redirect(`/panel/eventos/${eventId}`);
}

/**
 * Publica un evento en un clic desde su ficha.
 *
 * Existe porque el estado por defecto es borrador y un borrador no aparece en
 * el control de acceso: sin este atajo, la única forma de habilitar la puerta
 * es entrar a editar el evento y cambiar un desplegable, que no es obvio.
 */
export async function publishEventAction(eventId: string): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.PUBLISHED },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "event.update",
        entity: "event",
        entityId: eventId,
        payload: { status: EventStatus.PUBLISHED, via: "publish_shortcut" },
      });
    });
  } catch (error) {
    console.error("publishEventAction", error);
    return { error: "No se pudo publicar el evento." };
  }

  revalidatePath("/panel");
  revalidatePath(`/panel/eventos/${eventId}`);
  revalidatePath("/control");
  return { ok: true };
}

/**
 * Borrado real, con cascada a invitados, invitaciones y check-ins.
 *
 * **Solo administradores.** Es la única operación que destruye historial de
 * ingresos, y un organizador no debería poder borrar la prueba de quién entró
 * a una fiesta. Para dar de baja un evento sin perder nada está el estado
 * CANCELLED, que sí puede usar cualquiera que administre eventos.
 *
 * Además se exige tipear el nombre del evento como confirmación.
 */
export async function deleteEventAction(
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, _count: { select: { checkIns: true } } },
  });

  if (!event) return { error: "El evento ya no existe." };

  const typed = String(formData.get("confirmName") ?? "").trim();
  if (typed !== event.name) {
    return {
      fieldErrors: {
        confirmName: "El nombre no coincide con el del evento.",
      },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id: eventId } });
      await recordAudit(tx, {
        actorId: user.id,
        action: "event.delete",
        entity: "event",
        entityId: eventId,
        payload: { name: event.name, checkInsDestroyed: event._count.checkIns },
      });
    });
  } catch (error) {
    console.error("deleteEventAction", error);
    return { error: "No se pudo eliminar el evento." };
  }

  revalidatePath("/panel");
  redirect("/panel");
}
