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
  /**
   * Lo que el usuario había escrito, devuelto tal cual.
   *
   * React 19 resetea los formularios no controlados cuando termina una acción.
   * Sin esto, cualquier error de validación le borra al usuario todo lo que
   * venía cargando — y en el formulario de evento eso son diez campos.
   *
   * Los formularios leen de acá antes que de sus valores por defecto.
   */
  values?: Record<string, string>;
};

export const emptyFormState: FormState = {};

/**
 * Copia los campos de texto del formulario para poder repoblarlo si falla.
 *
 * Los checkbox sin marcar no viajan en el FormData: su ausencia significa
 * "desmarcado". Por eso los formularios tienen que preguntar si `values`
 * existe antes de decidir el estado de un checkbox, en vez de mirar solo si la
 * clave está.
 */
export function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

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
