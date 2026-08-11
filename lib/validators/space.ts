import { z } from "zod";

export const spaceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Poné un nombre para el espacio.")
    .max(80, "Máximo 80 caracteres."),
  capacity: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v === "" || v === null ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v > 0 && v <= 100_000),
      "La capacidad tiene que ser un número entero mayor a cero.",
    ),
  notes: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres.")
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  active: z.boolean(),
});

export type SpaceInput = z.infer<typeof spaceInputSchema>;

export function spaceInputFromFormData(formData: FormData) {
  return spaceInputSchema.safeParse({
    name: formData.get("name") ?? "",
    capacity: formData.get("capacity") ?? null,
    notes: formData.get("notes") ?? null,
    // Un checkbox sin marcar no se envía: su ausencia significa false.
    active: formData.get("active") === "on",
  });
}
