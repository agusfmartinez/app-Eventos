import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Acepta el cliente normal o el `tx` de una transacción, para que la auditoría
 * se revierta junto con la operación que registra. Tipo estructural a
 * propósito: no depende del nombre que Prisma le dé al cliente transaccional.
 */
type AuditClient = Pick<typeof prisma, "auditLog">;

export type AuditAction =
  | "event.create"
  | "event.update"
  | "event.delete"
  | "guest.create"
  | "guest.update"
  | "guest.delete"
  | "invitation.update_status"
  | "invitation.update_max_people";

export function recordAudit(
  db: AuditClient,
  entry: {
    actorId: string;
    action: AuditAction;
    entity: string;
    entityId: string;
    payload?: Prisma.InputJsonValue;
  },
) {
  return db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      payload: entry.payload ?? undefined,
    },
  });
}
