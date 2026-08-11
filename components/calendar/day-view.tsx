import Link from "next/link";

import { hourLabels } from "@/lib/calendar";
import {
  clipToWindow,
  VENUE_DAY_START_MIN,
  venueDayWindow,
  type OccupiedEvent,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";

/**
 * Vista de día: espacios en columnas, horas en filas.
 *
 * Es la pantalla que se mira mientras se habla con el anfitrión, así que lo
 * que tiene que saltar a la vista es el hueco libre, no el evento.
 *
 * La ventana va de 08:00 a 08:00 del día siguiente (ver `VENUE_DAY_START_MIN`):
 * una fiesta de 21:00 a 05:00 se ve entera y contigua, en vez de partida entre
 * dos pantallas.
 */

const statusStyle: Record<string, string> = {
  DRAFT: "bg-warn-surface border-warn/40 text-warn",
  PUBLISHED: "bg-brand/15 border-brand/40 text-brand",
  IN_PROGRESS: "bg-ok-surface border-ok/40 text-ok",
  FINISHED: "bg-background border-border text-muted",
};

export type DayColumn = {
  id: string | null;
  name: string;
  events: OccupiedEvent[];
};

export function DayView({
  date,
  columns,
}: {
  date: Date;
  columns: DayColumn[];
}) {
  const window = venueDayWindow(date);
  const hours = hourLabels(VENUE_DAY_START_MIN / 60);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-2xl">
        {/* Regla de horas */}
        <div className="w-14 shrink-0 pt-7">
          {hours.map((hour) => (
            <div
              key={hour}
              className="relative h-10 border-t border-border text-[11px] text-muted tabular-nums"
            >
              <span className="absolute -top-2 right-1.5 bg-background px-0.5">
                {hour}
              </span>
            </div>
          ))}
        </div>

        {columns.map((column) => (
          <div key={column.id ?? "sin-espacio"} className="min-w-40 flex-1">
            <div className="truncate px-2 pb-1 text-center text-sm font-semibold">
              {column.name}
            </div>

            <div className="relative border-l border-border">
              {hours.map((hour) => (
                <div key={hour} className="h-10 border-t border-border" />
              ))}

              {column.events.map((event) => {
                const box = clipToWindow(event.interval, window);
                if (!box) return null;

                return (
                  <Link
                    key={event.id}
                    href={`/panel/eventos/${event.id}`}
                    style={{
                      top: `${box.offsetPct}%`,
                      height: `${box.sizePct}%`,
                    }}
                    className={cn(
                      "absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight",
                      statusStyle[event.status] ?? "bg-background border-border",
                    )}
                  >
                    <span className="block truncate font-semibold">
                      {/* Las flechas avisan que el evento sigue fuera de la
                          ventana visible, para no leerlo como más corto. */}
                      {box.clippedStart ? "↑ " : ""}
                      {event.name}
                      {box.clippedEnd ? " ↓" : ""}
                    </span>
                    {event.startTime ? (
                      <span className="block truncate opacity-80">
                        {event.startTime}
                        {event.endTime ? ` a ${event.endTime}` : ""}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">
        La vista cubre de las 08:00 a las 08:00 del día siguiente, para que las
        fiestas que terminan de madrugada se vean completas. Las flechas ↑ ↓
        indican que el evento sigue fuera de la franja mostrada.
      </p>
    </div>
  );
}
