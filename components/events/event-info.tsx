import type { ReactNode } from "react";

import { Card, StatCard } from "@/components/ui/misc";
import {
  EVENT_STATUS_LABELS,
  formatEventDate,
} from "@/lib/format";
import type { EventStatus } from "@/lib/generated/prisma/enums";
import type { EventStats } from "@/lib/stats";

export type EventInfoData = {
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  spaceName: string | null;
  address: string | null;
  maxGuests: number | null;
  status: EventStatus;
  notes: string | null;
};

/**
 * Ficha del evento y estado de la lista.
 *
 * Los datos del evento se leen acá y no solo en el formulario de edición:
 * entrar a editar para consultar un horario es pedirle al organizador que abra
 * un formulario editable cada vez que quiere mirar algo.
 *
 * Lo que pasa *durante* el evento —quién entró, a qué ritmo— vive en la
 * pantalla de ingresos, que es de donde sale ese dato.
 */
export function EventInfo({
  event,
  stats,
}: {
  event: EventInfoData;
  stats: EventStats;
}) {
  const schedule = event.startTime
    ? `${event.startTime}${event.endTime ? ` a ${event.endTime}` : ""} hs`
    : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-semibold">Información del evento</h2>
      <Card className="p-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Item label="Fecha">{formatEventDate(event.eventDate)}</Item>
          <Item label="Horario">{schedule}</Item>
          <Item label="Estado">{EVENT_STATUS_LABELS[event.status]}</Item>
          <Item label="Espacio">{event.spaceName}</Item>
          <Item label="Dirección">{event.address}</Item>
          <Item label="Cupo">
            {event.maxGuests ? `${event.maxGuests} personas` : null}
          </Item>
        </dl>

        {event.notes ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs text-muted">Información adicional</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{event.notes}</p>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Invitados" value={stats.guests} />
        <StatCard label="Habilitados" value={stats.enabled} />
        <StatCard label="Sin confirmar" value={stats.pending} tone="warn" />
        <StatCard label="Bloqueados" value={stats.blocked} tone="deny" />
      </div>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {children ?? <span className="text-muted">—</span>}
      </dd>
    </div>
  );
}
