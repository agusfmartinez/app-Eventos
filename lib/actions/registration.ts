"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  collectValues,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/form-state";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findTicket, registerGuest } from "@/lib/registration";
import {
  registrationFromFormData,
  ticketLookupFromFormData,
} from "@/lib/validators/registration";

/**
 * Acciones del formulario público.
 *
 * Son las únicas de la aplicación que escriben **sin sesión**, así que no hay
 * ningún `requireAuth` que las proteja: lo que las cuida es el token del
 * formulario, el cupo, y el limitador por IP de acá abajo.
 */

/** Tiene que alcanzar para una familia entera anotándose desde el mismo wifi. */
const REGISTER_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/** La búsqueda es un oráculo si se puede repetir sin costo. */
const LOOKUP_LIMIT = { limit: 15, windowMs: 10 * 60_000 };

export type RegistrationState = FormState & {
  /** Token de la invitación generada: con esto se le muestra el QR. */
  ticket?: string;
  pending?: boolean;
  /** Ya estaba registrado y se le devolvió su entrada. */
  existing?: boolean;
};

const CLOSED_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Este link de registro no existe o fue dado de baja.",
  CLOSED: "El registro está cerrado. Consultá con quien te invitó.",
  EXPIRED: "Se venció la fecha para registrarse.",
  FULL: "Ya no quedan lugares disponibles.",
  DUPLICATE:
    "Ya hay un registro con ese DNI. Si es tuyo, buscá tu entrada con tu DNI y tu apellido.",
  ERROR: "No pudimos registrarte. Probá de nuevo en un momento.",
};

export async function registerAction(
  registrationToken: string,
  _prev: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const ip = clientIp(await headers());
  const limited = rateLimit(`register:${ip}`, REGISTER_LIMIT);

  if (!limited.ok) {
    return {
      values: collectValues(formData),
      error: `Demasiados intentos. Esperá ${Math.ceil(limited.retryAfterSeconds / 60)} minutos.`,
    };
  }

  const parsed = registrationFromFormData(formData);
  if (!parsed.success) {
    return {
      values: collectValues(formData),
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const result = await registerGuest(registrationToken, parsed.data);

  if (!result.ok) {
    if (result.reason === "TOO_MANY") {
      return {
        values: collectValues(formData),
        fieldErrors: {
          people: "No quedan lugares. Probá con menos personas.",
        },
      };
    }

    return {
      values: collectValues(formData),
      error: CLOSED_MESSAGES[result.reason] ?? CLOSED_MESSAGES.ERROR,
    };
  }

  // El panel muestra los registros nuevos sin tener que recargar a mano.
  revalidatePath("/panel");

  return {
    ok: true,
    ticket: result.token,
    pending: result.pending,
    existing: "existing" in result,
  };
}

export type TicketLookupState = FormState & {
  ticket?: string;
  eventName?: string;
};

export async function findTicketAction(
  _prev: TicketLookupState,
  formData: FormData,
): Promise<TicketLookupState> {
  const ip = clientIp(await headers());
  const limited = rateLimit(`ticket:${ip}`, LOOKUP_LIMIT);

  if (!limited.ok) {
    return {
      values: collectValues(formData),
      error: `Demasiadas búsquedas. Esperá ${Math.ceil(limited.retryAfterSeconds / 60)} minutos.`,
    };
  }

  const parsed = ticketLookupFromFormData(formData);
  if (!parsed.success) {
    return {
      values: collectValues(formData),
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const found = await findTicket(parsed.data.document, parsed.data.lastName);

  // Un solo mensaje para "no existe" y "el apellido no coincide": decir cuál
  // de los dos falló convertiría esto en un buscador de DNI ajeno.
  if (!found) {
    return {
      values: collectValues(formData),
      error:
        "No encontramos ninguna entrada con esos datos. Revisá el DNI y el apellido.",
    };
  }

  return { ok: true, ticket: found.token, eventName: found.eventName };
}
