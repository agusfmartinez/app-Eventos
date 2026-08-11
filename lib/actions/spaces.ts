"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  collectValues,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/form-state";
import { spaceInputFromFormData } from "@/lib/validators/space";

function refresh() {
  revalidatePath("/panel/espacios");
  revalidatePath("/panel");
}

function isDuplicateName(error: unknown): boolean {
  return error instanceof Error && error.message.includes("spaces_name_key");
}

export async function createSpaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const parsed = spaceInputFromFormData(formData);
  if (!parsed.success) return { values: collectValues(formData), fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const space = await tx.space.create({
        data: {
          name: input.name,
          capacity: input.capacity,
          notes: input.notes,
          active: input.active,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "space.create",
        entity: "space",
        entityId: space.id,
        payload: { name: input.name, capacity: input.capacity },
      });
    });
  } catch (error) {
    if (isDuplicateName(error)) {
      return { fieldErrors: { name: "Ya existe un espacio con ese nombre." } };
    }
    console.error("createSpaceAction", error);
    return { values: collectValues(formData), error: "No se pudo crear el espacio. Intentá de nuevo." };
  }

  refresh();
  return { ok: true };
}

export async function updateSpaceAction(
  spaceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const parsed = spaceInputFromFormData(formData);
  if (!parsed.success) return { values: collectValues(formData), fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.space.update({
        where: { id: spaceId },
        data: {
          name: input.name,
          capacity: input.capacity,
          notes: input.notes,
          active: input.active,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "space.update",
        entity: "space",
        entityId: spaceId,
        payload: { name: input.name, active: input.active },
      });
    });
  } catch (error) {
    if (isDuplicateName(error)) {
      return { fieldErrors: { name: "Ya existe un espacio con ese nombre." } };
    }
    console.error("updateSpaceAction", error);
    return { values: collectValues(formData), error: "No se pudo guardar el espacio. Intentá de nuevo." };
  }

  refresh();
  return { ok: true };
}

/**
 * Los espacios no se borran, se desactivan.
 *
 * Un espacio borrado dejaría a sus eventos pasados sin ambiente y el historial
 * dejaría de decir dónde se hizo cada fiesta. Desactivar lo saca del selector
 * de eventos nuevos sin tocar nada de lo ya ocurrido.
 */
export async function toggleSpaceActiveAction(
  spaceId: string,
): Promise<FormState> {
  const user = await requireAdminOrOrganizer();

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { active: true, name: true },
  });
  if (!space) return { error: "El espacio ya no existe." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.space.update({
        where: { id: spaceId },
        data: { active: !space.active },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "space.update",
        entity: "space",
        entityId: spaceId,
        payload: { name: space.name, active: !space.active },
      });
    });
  } catch (error) {
    console.error("toggleSpaceActiveAction", error);
    return { error: "No se pudo cambiar el estado del espacio." };
  }

  refresh();
  return { ok: true };
}
