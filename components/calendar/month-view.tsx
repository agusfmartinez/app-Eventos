import Link from "next/link";

import { buildMonthGrid, toDayKey, WEEKDAY_LABELS } from "@/lib/calendar";
import type { OccupiedEvent } from "@/lib/schedule";
import { cn } from "@/lib/utils";

/**
 * Vista de mes: panorama para ubicarse rápido.
 *
 * Cada evento se muestra en su fecha de inicio. Los que terminan de madrugada
 * llevan una flecha: siguen ocupando el día siguiente, y esa es información
 * que hace falta al ofrecer fechas.
 */

const statusStyle: Record<string, string> = {
  DRAFT: "bg-warn-surface text-warn",
  PUBLISHED: "bg-brand/10 text-brand",
  IN_PROGRESS: "bg-ok-surface text-ok",
  FINISHED: "bg-background text-muted",
};

function crossesMidnight(event: OccupiedEvent): boolean {
  return Boolean(
    event.startTime && event.endTime && event.endTime <= event.startTime,
  );
}

export function MonthView({
  firstOfMonth,
  events,
  today,
  buildDayHref,
}: {
  firstOfMonth: Date;
  events: OccupiedEvent[];
  today: string;
  buildDayHref: (dayKey: string) => string;
}) {
  const weeks = buildMonthGrid(firstOfMonth);

  const byDay = new Map<string, OccupiedEvent[]>();
  for (const event of events) {
    const key = toDayKey(event.eventDate);
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-3xl">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-1.5 text-center text-xs font-semibold text-muted uppercase"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {weeks.flat().map((cell) => {
            const dayEvents = byDay.get(cell.key) ?? [];
            const isToday = cell.key === today;

            return (
              <Link
                key={cell.key}
                href={buildDayHref(cell.key)}
                className={cn(
                  "flex min-h-24 flex-col gap-1 p-1.5 transition-colors",
                  cell.inMonth ? "bg-surface" : "bg-background",
                  "hover:bg-brand/5",
                )}
              >
                <span
                  className={cn(
                    "self-start rounded px-1 text-xs tabular-nums",
                    isToday
                      ? "bg-brand font-bold text-brand-foreground"
                      : cell.inMonth
                        ? "text-foreground"
                        : "text-muted",
                  )}
                >
                  {cell.date.getUTCDate()}
                </span>

                {dayEvents.map((event) => (
                  <span
                    key={event.id}
                    title={`${event.name}${event.spaceName ? ` — ${event.spaceName}` : ""}`}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[11px] leading-tight",
                      statusStyle[event.status] ?? "bg-background text-muted",
                    )}
                  >
                    {event.startTime ? `${event.startTime} ` : ""}
                    {event.name}
                    {crossesMidnight(event) ? " →" : ""}
                  </span>
                ))}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
