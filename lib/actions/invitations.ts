"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { generateInvitationToken, generateShortCode } from "@/lib/tokens";

/**
 * Regenera el token y el código corto de una invitación.
 *
 * Sirve cuando la invitación se filtró o se mandó a la persona equivocada:
 * el link y el QR viejos dejan de funcionar al instante.
 *
 * NO toca enteredCount ni los check-ins. Quien ya entró, entró: el libro de
 * ingresos refleja lo que pasó en la puerta y regenerar un link no cambia eso.
 */
export async function regenerateInvitationAction(
  guestId: string,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      eventId: true,
      invitation: { select: { id: true } },
    },
  });

  if (!guest?.invitation) return { error: "El invitado no tiene invitación." };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invitation.update({
          where: { id: guest.invitation!.id },
          data: {
            token: generateInvitationToken(),
            shortCode: generateShortCode(),
          },
          select: { id: true },
        });

        await recordAudit(tx, {
          actorId: user.id,
          action: "invitation.regenerate",
          entity: "invitation",
          entityId: guest.invitation!.id,
          payload: { guestId },
        });
      });

      revalidatePath(`/panel/eventos/${guest.eventId}`);
      revalidatePath(`/panel/eventos/${guest.eventId}/invitados/${guestId}`);
      return { ok: true };
    } catch (error) {
      // shortCode es único por evento: si chocamos, reintentamos.
      const collision =
        error instanceof Error && error.message.includes("short_code");
      if (collision && attempt < 4) continue;

      console.error("regenerateInvitationAction", error);
      return { error: "No se pudo regenerar la invitación." };
    }
  }

  return { error: "No se pudo generar un código único. Intentá de nuevo." };
}
