import { z } from "zod";

import { InvitationStatus } from "@/lib/generated/prisma/enums";

/** El teléfono se guarda solo con dígitos: así la búsqueda no depende de
 *  si alguien escribió guiones, paréntesis o espacios. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullable()
    .transform((v) => (v === "" ? null : v));

export const guestInputSchema = z.object({
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
  /**
   * Opcional para la carga manual: el organizador casi nunca lo tiene. El
   * formulario público sí lo exige, porque es con lo que la persona recupera
   * su entrada.
   */
  document: z
    .string()
    .trim()
    .nullable()
    .transform((v) => {
      if (v === null) return null;
      const digits = digitsOnly(v);
      return digits === "" ? null : digits;
    })
    .refine(
      (v) => v === null || (v.length >= 6 && v.length <= 12),
      "El DNI tiene que tener entre 6 y 12 dígitos, sin puntos.",
    ),
  phone: z
    .string()
    .trim()
    .nullable()
    .transform((v) => {
      if (v === null) return null;
      const digits = digitsOnly(v);
      return digits === "" ? null : digits;
    })
    .refine(
      (v) => v === null || (v.length >= 6 && v.length <= 20),
      "El teléfono tiene que tener entre 6 y 20 dígitos.",
    ),
  notes: optionalText(500),
  maxPeople: z.coerce
    .number()
    .int("Tiene que ser un número entero.")
    .min(1, "Al menos 1 persona.")
    .max(50, "Máximo 50 personas por invitación."),
  status: z.enum(InvitationStatus),
});

export type GuestInput = z.infer<typeof guestInputSchema>;

export function guestInputFromFormData(formData: FormData) {
  return guestInputSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    document: formData.get("document") ?? null,
    phone: formData.get("phone") ?? null,
    notes: formData.get("notes") ?? null,
    maxPeople: formData.get("maxPeople") ?? 1,
    status: formData.get("status") ?? InvitationStatus.ENABLED,
  });
}
