import { z } from "zod";

import { digitsOnly } from "@/lib/validators/guest";

/**
 * Datos que carga el propio invitado.
 *
 * Es el mismo formulario que llena el organizador, con dos diferencias: el DNI
 * es obligatorio —es con lo que después recupera su entrada y lo que evita que
 * se anote dos veces— y no hay campo de estado ni de notas internas.
 */
export const registrationSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Poné tu nombre.")
    .max(80, "Máximo 80 caracteres."),
  lastName: z
    .string()
    .trim()
    .min(1, "Poné tu apellido.")
    .max(80, "Máximo 80 caracteres."),
  document: z
    .string()
    .trim()
    .transform(digitsOnly)
    .refine(
      (v) => v.length >= 6 && v.length <= 12,
      "Revisá el DNI: van solo los números, sin puntos.",
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
  people: z.coerce
    .number()
    .int("Tiene que ser un número entero.")
    .min(1, "Al menos 1 persona.")
    .max(50, "Demasiadas personas para un solo registro."),
});

export type RegistrationFormInput = z.infer<typeof registrationSchema>;

export function registrationFromFormData(formData: FormData) {
  return registrationSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    document: formData.get("document") ?? "",
    phone: formData.get("phone") ?? null,
    people: formData.get("people") ?? 1,
  });
}

/** Búsqueda de la entrada perdida. Pide los dos datos, nunca uno solo. */
export const ticketLookupSchema = z.object({
  document: z
    .string()
    .trim()
    .transform(digitsOnly)
    .refine((v) => v.length >= 6 && v.length <= 12, "Revisá el DNI."),
  lastName: z.string().trim().min(1, "Poné tu apellido."),
});

export function ticketLookupFromFormData(formData: FormData) {
  return ticketLookupSchema.safeParse({
    document: formData.get("document") ?? "",
    lastName: formData.get("lastName") ?? "",
  });
}
