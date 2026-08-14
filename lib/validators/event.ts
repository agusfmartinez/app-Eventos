import { z } from "zod";

import { EventStatus } from "@/lib/generated/prisma/enums";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullable()
    .transform((v) => (v === "" ? null : v));

const optionalTime = z
  .string()
  .trim()
  .nullable()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || TIME_RE.test(v), "Usá el formato HH:MM.");

/**
 * A propósito NO se valida que endTime sea posterior a startTime: un
 * casamiento que arranca 21:00 y termina 05:00 es lo normal, no un error.
 */
export const eventInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Poné un nombre para el evento.")
    .max(120, "Máximo 120 caracteres."),
  eventDate: z
    .string()
    .trim()
    .regex(DATE_RE, "Elegí una fecha válida."),
  startTime: optionalTime,
  endTime: optionalTime,
  notes: optionalText(2000),
  status: z.enum(EventStatus),
  spaceId: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v === "" || v === null ? null : v)),
  /// Cupo pactado. Se avisa al superarlo, no se bloquea: es un acuerdo
  /// comercial, no un límite físico exacto.
  maxGuests: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v === "" || v === null ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v > 0 && v <= 100_000),
      "El cupo tiene que ser un número entero mayor a cero.",
    ),
});

export type EventInput = z.infer<typeof eventInputSchema>;

/**
 * La columna es DATE, sin hora. Se ancla a medianoche UTC para que la fecha
 * que se guarda sea exactamente la que se eligió, sin que la zona horaria del
 * servidor la corra un día.
 */
export function parseEventDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function eventInputFromFormData(formData: FormData) {
  return eventInputSchema.safeParse({
    name: formData.get("name") ?? "",
    eventDate: formData.get("eventDate") ?? "",
    startTime: formData.get("startTime") ?? null,
    endTime: formData.get("endTime") ?? null,
    notes: formData.get("notes") ?? null,
    status: formData.get("status") ?? EventStatus.DRAFT,
    spaceId: formData.get("spaceId") ?? null,
    maxGuests: formData.get("maxGuests") ?? null,
  });
}
