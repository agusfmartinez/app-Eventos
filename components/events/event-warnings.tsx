import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";

import { formatEventDateShort } from "@/lib/format";
import type { ScheduleConflict } from "@/lib/schedule";

/**
 * Avisos de la ficha del evento.
 *
 * El **cupo** solo avisa: es un acuerdo comercial, y frenar un alta la noche
 * antes del evento sería peor que el problema que se quiere evitar.
 *
 * El **solapamiento**, en cambio, está bloqueado al guardar (ver
 * `lib/actions/events.ts`). Este aviso queda como red para los eventos que ya
 * se pisaban antes de esa regla, o para los que quedaron solapados al
 * desasignar y reasignar espacios.
 */

export function ScheduleConflictWarning({
  conflicts,
  spaceName,
}: {
  conflicts: ScheduleConflict[];
  spaceName: string;
}) {
  if (conflicts.length === 0) return null;

  return (
    <div className="flex gap-3 rounded-xl bg-warn-surface px-4 py-3">
      <CalendarClock size={20} className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-warn">
          {conflicts.length === 1
            ? "Se superpone con otro evento"
            : `Se superpone con ${conflicts.length} eventos`}{" "}
          en {spaceName}
        </p>
        <ul className="mt-1 flex flex-col gap-0.5 text-sm text-warn/90">
          {conflicts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/panel/eventos/${c.id}`}
                className="underline underline-offset-2"
              >
                {c.name}
              </Link>{" "}
              — {formatEventDateShort(c.eventDate)}
              {c.startTime ? ` ${c.startTime}` : ""}
              {c.endTime ? ` a ${c.endTime}` : ""}
              {c.status === "DRAFT" ? " (borrador)" : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CapacityWarning({
  capacity,
  authorized,
}: {
  capacity: number;
  authorized: number;
}) {
  if (authorized <= capacity) return null;

  return (
    <div className="flex gap-3 rounded-xl bg-warn-surface px-4 py-3">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warn" />
      <div>
        <p className="text-sm font-medium text-warn">
          Se superó el cupo del evento
        </p>
        <p className="text-sm text-warn/90">
          Hay {authorized} personas autorizadas y el cupo pactado es{" "}
          {capacity}. Revisá con el anfitrión o ajustá el cupo desde Editar.
        </p>
      </div>
    </div>
  );
}
