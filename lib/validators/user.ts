import { z } from "zod";

import { Role } from "@/lib/generated/prisma/enums";

/**
 * El admin no elige la contraseña: el sistema genera una temporal y la persona
 * la cambia en su primer ingreso. Por eso acá no hay campo de contraseña.
 *
 * El username tampoco se pide: se deriva del nombre y el apellido
 * (ver lib/username.ts).
 */
export const userInputSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Poné el nombre.")
    .max(80, "Máximo 80 caracteres."),
  lastName: z
    .string()
    .trim()
    .min(1, "Poné el apellido.")
    .max(80, "Máximo 80 caracteres."),
  email: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v === null || v === "" ? null : v.toLowerCase()))
    .refine(
      (v) => v === null || z.email().safeParse(v).success,
      "Revisá el email.",
    ),
  role: z.enum(Role),
});

export type UserInput = z.infer<typeof userInputSchema>;

export function userInputFromFormData(formData: FormData) {
  return userInputSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? null,
    role: formData.get("role") ?? Role.DOOR,
  });
}
