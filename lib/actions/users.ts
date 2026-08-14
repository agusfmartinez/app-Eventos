"use server";

import { hash } from "@node-rs/argon2";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  collectValues,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/form-state";
import { Role } from "@/lib/generated/prisma/enums";
import { generateTemporaryPassword } from "@/lib/tokens";
import { buildUsername, resolveUsernameCollision } from "@/lib/username";
import { userInputFromFormData } from "@/lib/validators/user";

/**
 * Gestión de cuentas del personal. Solo administradores.
 *
 * Las cuentas **no se borran**: se desactivan. Un usuario borrado se llevaría
 * por delante la referencia de operador en los check-ins que registró, y el
 * historial dejaría de decir quién dejó entrar a quién.
 *
 * Las contraseñas nunca las elige el admin: el sistema genera una temporal, se
 * la muestra **una sola vez** para que se la pase a la persona, y la persona
 * la cambia en su primer ingreso. Así el admin no termina conociendo la
 * contraseña definitiva de nadie.
 */

/** Resultado que además devuelve la contraseña temporal para mostrarla. */
export type CredentialsState = FormState & {
  credentials?: { username: string; temporaryPassword: string };
};

function refresh() {
  revalidatePath("/panel/usuarios");
}

function isDuplicateEmail(error: unknown): boolean {
  return error instanceof Error && error.message.includes("users_email_key");
}

/**
 * Username libre a partir del nombre, numerando si ya existe.
 *
 * Solo se usa en el alta: después el username queda fijo aunque cambie el
 * nombre, porque es con lo que la persona entra.
 */
async function pickUsername(
  firstName: string,
  lastName: string,
): Promise<string> {
  const candidate = buildUsername(firstName, lastName);

  const similar = await prisma.user.findMany({
    where: { username: { startsWith: candidate } },
    select: { username: true },
  });

  return resolveUsernameCollision(
    candidate,
    new Set(similar.map((u) => u.username)),
  );
}

async function wouldRemoveLastAdmin(
  targetId: string,
  nextRole: Role,
  nextActive: boolean,
): Promise<boolean> {
  if (nextRole === Role.ADMIN && nextActive) return false;

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, active: true },
  });
  if (!target || target.role !== Role.ADMIN || !target.active) return false;

  const activeAdmins = await prisma.user.count({
    where: { role: Role.ADMIN, active: true },
  });

  return activeAdmins <= 1;
}

export async function createUserAction(
  _prev: CredentialsState,
  formData: FormData,
): Promise<CredentialsState> {
  const actor = await requireAdmin();

  const parsed = userInputFromFormData(formData);
  if (!parsed.success) {
    return {
      values: collectValues(formData),
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const input = parsed.data;
  const temporaryPassword = generateTemporaryPassword();
  let username: string;

  try {
    username = await pickUsername(input.firstName, input.lastName);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          role: input.role,
          passwordHash: await hash(temporaryPassword),
          mustChangePassword: true,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "user.create",
        entity: "user",
        entityId: user.id,
        // Nunca se registra la contraseña ni su hash en la auditoría.
        payload: { username, role: input.role },
      });
    });
  } catch (error) {
    if (isDuplicateEmail(error)) {
      return {
        values: collectValues(formData),
        fieldErrors: { email: "Ya existe una cuenta con ese email." },
      };
    }
    console.error("createUserAction", error);
    return {
      values: collectValues(formData),
      error: "No se pudo crear el usuario. Intentá de nuevo.",
    };
  }

  refresh();
  return { ok: true, credentials: { username, temporaryPassword } };
}

export async function updateUserAction(
  userId: string,
  _prev: CredentialsState,
  formData: FormData,
): Promise<CredentialsState> {
  const actor = await requireAdmin();

  const parsed = userInputFromFormData(formData);
  if (!parsed.success) {
    return {
      values: collectValues(formData),
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const input = parsed.data;

  if (userId === actor.id && input.role !== Role.ADMIN) {
    return {
      values: collectValues(formData),
      error:
        "No podés quitarte el rol de administrador. Pedíselo a otro administrador.",
    };
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, username: true },
  });
  if (!current) return { error: "El usuario ya no existe." };

  if (await wouldRemoveLastAdmin(userId, input.role, current.active)) {
    return {
      values: collectValues(formData),
      error:
        "Es el único administrador activo. Creá o habilitá otro antes de cambiarle el rol.",
    };
  }

  try {
    // El username no se regenera al corregir el nombre: es la credencial con
    // la que la persona inicia sesión y ya la tiene anotada. Cambiarlo por un
    // typo en el apellido la dejaría afuera sin que nadie se entere.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          role: input.role,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "user.update",
        entity: "user",
        entityId: userId,
        payload: {
          username: current.username,
          role: input.role,
        },
      });
    });
  } catch (error) {
    if (isDuplicateEmail(error)) {
      return {
        values: collectValues(formData),
        fieldErrors: { email: "Ya existe una cuenta con ese email." },
      };
    }
    console.error("updateUserAction", error);
    return {
      values: collectValues(formData),
      error: "No se pudo guardar el usuario. Intentá de nuevo.",
    };
  }

  refresh();
  return { ok: true };
}

/**
 * Reseteo de contraseña por parte del admin.
 *
 * Genera una temporal nueva y obliga a cambiarla en el próximo ingreso. Es el
 * reemplazo del "olvidé mi contraseña" por email: alguien se la pide al admin,
 * el admin se la dicta, y la persona elige la suya al entrar.
 */
export async function resetPasswordAction(
  userId: string,
): Promise<CredentialsState> {
  const actor = await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!user) return { error: "El usuario ya no existe." };

  const temporaryPassword = generateTemporaryPassword();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hash(temporaryPassword),
          mustChangePassword: true,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "user.password_reset",
        entity: "user",
        entityId: userId,
        payload: { username: user.username },
      });
    });
  } catch (error) {
    console.error("resetPasswordAction", error);
    return { error: "No se pudo resetear la contraseña." };
  }

  refresh();
  return {
    ok: true,
    credentials: { username: user.username, temporaryPassword },
  };
}

/** Habilitar o desactivar, con las mismas protecciones. */
export async function toggleUserActiveAction(
  userId: string,
): Promise<CredentialsState> {
  const actor = await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true, username: true },
  });
  if (!user) return { error: "El usuario ya no existe." };

  const nextActive = !user.active;

  if (userId === actor.id && !nextActive) {
    return { error: "No podés desactivar tu propia cuenta." };
  }

  if (await wouldRemoveLastAdmin(userId, user.role, nextActive)) {
    return {
      error:
        "Es el único administrador activo. Habilitá otro antes de desactivarlo.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { active: nextActive },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: actor.id,
        action: "user.update",
        entity: "user",
        entityId: userId,
        payload: { username: user.username, active: nextActive },
      });
    });
  } catch (error) {
    console.error("toggleUserActiveAction", error);
    return { error: "No se pudo cambiar el estado del usuario." };
  }

  refresh();
  return { ok: true };
}
