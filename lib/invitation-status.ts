import { InvitationStatus } from "@/lib/generated/prisma/enums";

export type DerivedStatus =
  | "PENDING"
  | "BLOCKED"
  | "CANCELLED"
  | "ENTERED"
  | "PARTIAL"
  | "ENABLED";

/**
 * Los estados INGRESADO y PARCIALMENTE INGRESADO del brief no están en la
 * base: se derivan de enteredCount vs maxPeople. Guardarlos duplicaría estado
 * y abriría la puerta a que el contador y la etiqueta digan cosas distintas.
 *
 * Esta función es la única fuente de esa derivación — el scanner de la Fase 4
 * también la usa.
 */
export function deriveStatus(invitation: {
  status: InvitationStatus;
  maxPeople: number;
  enteredCount: number;
}): DerivedStatus {
  if (invitation.status === InvitationStatus.BLOCKED) return "BLOCKED";
  if (invitation.status === InvitationStatus.CANCELLED) return "CANCELLED";
  if (invitation.status === InvitationStatus.PENDING) return "PENDING";
  if (invitation.enteredCount >= invitation.maxPeople) return "ENTERED";
  if (invitation.enteredCount > 0) return "PARTIAL";
  return "ENABLED";
}

export const STATUS_LABELS: Record<DerivedStatus, string> = {
  PENDING: "Pendiente",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
  ENTERED: "Ingresó",
  PARTIAL: "Parcial",
  ENABLED: "Habilitado",
};

export const STATUS_TONES: Record<
  DerivedStatus,
  "neutral" | "ok" | "warn" | "deny"
> = {
  PENDING: "neutral",
  BLOCKED: "deny",
  CANCELLED: "deny",
  ENTERED: "ok",
  PARTIAL: "warn",
  ENABLED: "neutral",
};
