"use server";

import { hash, verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { collectValues, type FormState } from "@/lib/form-state";

/**
 * Cambio de contraseña por parte del propio usuario.
 *
 * Es la única acción que no pasa por `requireAuth`: ese guard manda justamente
 * a esta pantalla cuando hay una contraseña temporal pendiente, así que usarlo
 * acá dejaría al usuario en un bucle. Verifica la sesión por su cuenta.
 */
export async function changeOwnPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const repeat = String(formData.get("repeatPassword") ?? "");

  const values = collectValues(formData);

  if (next.length < 8) {
    return {
      values,
      fieldErrors: { newPassword: "Tiene que tener al menos 8 caracteres." },
    };
  }

  if (next !== repeat) {
    return {
      values,
      fieldErrors: { repeatPassword: "Las dos contraseñas no coinciden." },
    };
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) redirect("/login");

  // Se pide la actual aunque el usuario ya tenga sesión: si deja la pantalla
  // abierta en la tablet de la puerta, cualquiera que pase no puede cambiarle
  // la contraseña y quedarse con la cuenta.
  const ok = await verify(record.passwordHash, current).catch(() => false);
  if (!ok) {
    return {
      values,
      fieldErrors: { currentPassword: "La contraseña actual no es correcta." },
    };
  }

  if (next === current) {
    return {
      values,
      fieldErrors: {
        newPassword: "Elegí una contraseña distinta de la actual.",
      },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hash(next), mustChangePassword: false },
        select: { id: true },
      });

      await recordAudit(tx, {
        actorId: user.id,
        action: "user.password_change",
        entity: "user",
        entityId: user.id,
        payload: { username: user.username, self: true },
      });
    });
  } catch (error) {
    console.error("changeOwnPasswordAction", error);
    return { values, error: "No se pudo cambiar la contraseña." };
  }

  redirect("/");
}
