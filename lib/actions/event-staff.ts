"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form-state";

/**
 * Quién trabaja en la puerta de cada evento.
 *
 * Lo administra el organizador —no hace falta ser admin—: asignar personal a
 * un evento es parte de organizarlo, y no otorga permisos nuevos a nadie. Lo
 * que sí está reservado a los administradores es crear cuentas y cambiar
 * roles (ver `lib/actions/users.ts`).
 */

function refresh(eventId: string) {
  revalidatePath(`/panel/eventos/${eventId}`);
  revalidatePath("/control");
}

export async function assignStaffAction(
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAdminOrOrganizer();

  const userId = String(formData.get("userId") ?? "").trim();
  const stationLabel =
    String(formData.get("stationLabel") ?? "")
      .trim()
      .slice(0, 60) || null;

  if (!userId) return { error: "Elegí a quién asignar." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, active: true },
  });
  if (!user) return { error: "El usuario ya no existe." };
  if (!user.active) {
    return { error: "Esa cuenta está desactivada. Habilitala primero." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // upsert y no create: reasignar a alguien que ya está sirve para
      // cambiarle el puesto sin tener que sacarlo y volverlo a poner.
      await tx.eventStaff.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId, stationLabel },
        update: { stationLabel },
        select: { eventId: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "event_staff.assign",
        entity: "event",
        entityId: eventId,
        payload: { userId, username: user.username, stationLabel },
      });
    });
  } catch (error) {
    console.error("assignStaffAction", error);
    return { error: "No se pudo asignar. Intentá de nuevo." };
  }

  refresh(eventId);
  return { ok: true };
}

export async function unassignStaffAction(
  eventId: string,
  userId: string,
): Promise<FormState> {
  const actor = await requireAdminOrOrganizer();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventStaff.delete({
        where: { eventId_userId: { eventId, userId } },
        select: { eventId: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "event_staff.unassign",
        entity: "event",
        entityId: eventId,
        payload: { userId },
      });
    });
  } catch (error) {
    console.error("unassignStaffAction", error);
    return { error: "No se pudo quitar la asignación." };
  }

  refresh(eventId);
  return { ok: true };
}

