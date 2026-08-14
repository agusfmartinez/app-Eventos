"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { collectValues, type FormState } from "@/lib/form-state";
import { generateInvitationToken } from "@/lib/tokens";

/**
 * Controles del formulario público, del lado del salón.
 *
 * El token se genera acá y no al crear el evento: un evento que nunca va a usar
 * el formulario no tiene por qué tener un link vivo dando vueltas.
 */

function refresh(eventId: string) {
  revalidatePath(`/panel/eventos/${eventId}`);
}

export async function saveRegistrationSettingsAction(
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAdminOrOrganizer();

  const open = formData.get("registrationOpen") !== null;
  const autoApprove = formData.get("registrationAutoApprove") !== null;

  const maxPeople = Number.parseInt(
    String(formData.get("registrationMaxPeople") ?? "1"),
    10,
  );
  const deadlineRaw = String(formData.get("registrationDeadline") ?? "").trim();

  if (!Number.isInteger(maxPeople) || maxPeople < 1 || maxPeople > 50) {
    return {
      values: collectValues(formData),
      fieldErrors: {
        registrationMaxPeople: "Entre 1 y 50 personas por registro.",
      },
    };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { registrationToken: true },
  });
  if (!event) return { error: "El evento ya no existe." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          // Abrir el formulario por primera vez es lo que crea el link.
          registrationToken:
            event.registrationToken ??
            (open ? generateInvitationToken() : null),
          registrationOpen: open,
          registrationAutoApprove: autoApprove,
          registrationMaxPeople: maxPeople,
          registrationDeadline: deadlineRaw
            ? new Date(`${deadlineRaw}T00:00:00.000Z`)
            : null,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "event.registration_settings",
        entity: "event",
        entityId: eventId,
        payload: { open, autoApprove, maxPeople, deadline: deadlineRaw || null },
      });
    });
  } catch (error) {
    console.error("saveRegistrationSettingsAction", error);
    return {
      values: collectValues(formData),
      error: "No se pudo guardar. Intentá de nuevo.",
    };
  }

  refresh(eventId);
  return { ok: true };
}

/**
 * Genera un link nuevo y da de baja el anterior.
 *
 * Es el botón de pánico: si el link se filtró más de la cuenta, esto lo corta
 * sin tocar a nadie que ya se haya registrado.
 */
export async function regenerateRegistrationLinkAction(
  eventId: string,
): Promise<{ error?: string }> {
  const actor = await requireAdminOrOrganizer();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: { registrationToken: generateInvitationToken() },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "event.registration_link_reset",
        entity: "event",
        entityId: eventId,
        payload: {},
      });
    });
  } catch (error) {
    console.error("regenerateRegistrationLinkAction", error);
    return { error: "No se pudo generar el link. Intentá de nuevo." };
  }

  refresh(eventId);
  return {};
}
