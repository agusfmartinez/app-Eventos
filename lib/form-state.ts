import type { ZodError } from "zod";

/**
 * Resultado uniforme de las Server Actions que respaldan formularios.
 *
 * `fieldErrors` mapea nombre de campo → primer mensaje, que es lo que el
 * formulario muestra debajo de cada input. `error` es para fallas que no
 * pertenecen a un campo (permisos, conflictos, errores inesperados).
 */
export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export const emptyFormState: FormState = {};

export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    // Primer mensaje por campo: mostrar tres errores del mismo input solo
    // agrega ruido.
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Los <input> vacíos llegan como "" — para campos opcionales queremos null. */
export function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
