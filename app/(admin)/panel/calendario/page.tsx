import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { DayView, type DayColumn } from "@/components/calendar/day-view";
import { MonthView } from "@/components/calendar/month-view";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";
import { requireAdminOrOrganizer } from "@/lib/authz";
import {
  addDays,
  addMonths,
  dayLabel,
  monthLabel,
  parseDayKey,
  parseMonthKey,
  toDayKey,
  toMonthKey,
} from "@/lib/calendar";
import { prisma } from "@/lib/db";
import { todayAtVenue } from "@/lib/format";
import { getOccupancy, overlaps, venueDayWindow } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendario" };
export const dynamic = "force-dynamic";

type Search = { vista?: string; mes?: string; dia?: string; espacio?: string };

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdminOrOrganizer();
  const sp = await searchParams;

  const today = todayAtVenue();
  const todayDate = new Date(`${today}T00:00:00.000Z`);

  const view = sp.vista === "dia" ? "dia" : "mes";
  const spaceId = sp.espacio && sp.espacio !== "todos" ? sp.espacio : null;

  const firstOfMonth = parseMonthKey(sp.mes, todayDate);
  const day = parseDayKey(sp.dia, todayDate);

  const spaces = await prisma.space.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true },
  });

  function href(next: Partial<Search>) {
    const params = new URLSearchParams();
    const merged: Search = {
      vista: view,
      mes: toMonthKey(firstOfMonth),
      dia: toDayKey(day),
      espacio: spaceId ?? "todos",
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/panel/calendario?${params.toString()}`;
  }

  // ---------------- datos ----------------

  const rangeFrom =
    view === "mes" ? addDays(firstOfMonth, -7) : addDays(day, -1);
  const rangeTo =
    view === "mes" ? addMonths(firstOfMonth, 1) : addDays(day, 1);

  const events = await getOccupancy({
    fromDate: rangeFrom,
    toDate: rangeTo,
    spaceId,
  });

  let columns: DayColumn[] = [];
  if (view === "dia") {
    const window = venueDayWindow(day);
    const visible = events.filter((e) => overlaps(e.interval, window));

    // Una columna por espacio, más una para los eventos sin espacio asignado
    // —que existen y también ocupan al salón, aunque no se pueda saber dónde.
    const relevant = spaces.filter(
      (s) => !spaceId || s.id === spaceId,
    );

    columns = relevant.map((space) => ({
      id: space.id,
      name: space.name,
      events: visible.filter((e) => e.spaceId === space.id),
    }));

    const unassigned = visible.filter((e) => e.spaceId === null);
    if (unassigned.length > 0 && !spaceId) {
      columns.push({ id: null, name: "Sin espacio", events: unassigned });
    }

    if (columns.length === 0) {
      columns = [{ id: null, name: "Sin espacios cargados", events: visible }];
    }
  }

  // ---------------- interfaz ----------------

  const tab = (label: string, value: "mes" | "dia") => (
    <Link
      href={href({ vista: value })}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium",
        view === value
          ? "bg-brand text-brand-foreground"
          : "border border-border bg-surface text-muted",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Calendario"
        subtitle="Disponibilidad de los espacios. Tocá un día para ver los horarios libres."
        actions={
          <ButtonLink href="/panel/eventos/nuevo">
            <Plus size={16} />
            Nuevo evento
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {tab("Mes", "mes")}
          {tab("Día", "dia")}
        </div>

        <div className="flex items-center gap-1">
          <Link
            aria-label="Anterior"
            href={
              view === "mes"
                ? href({ mes: toMonthKey(addMonths(firstOfMonth, -1)) })
                : href({ dia: toDayKey(addDays(day, -1)) })
            }
            className={buttonClass("secondary", "sm")}
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            aria-label="Siguiente"
            href={
              view === "mes"
                ? href({ mes: toMonthKey(addMonths(firstOfMonth, 1)) })
                : href({ dia: toDayKey(addDays(day, 1)) })
            }
            className={buttonClass("secondary", "sm")}
          >
            <ChevronRight size={16} />
          </Link>
          <Link
            href={href({
              mes: toMonthKey(todayDate),
              dia: today,
            })}
            className={buttonClass("ghost", "sm")}
          >
            Hoy
          </Link>
        </div>

        <p className="font-semibold capitalize">
          {view === "mes" ? monthLabel(firstOfMonth) : dayLabel(day)}
        </p>

        {spaces.length > 0 ? (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Link
              href={href({ espacio: "todos" })}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium",
                !spaceId
                  ? "bg-foreground text-background"
                  : "border border-border bg-surface text-muted",
              )}
            >
              Todos
            </Link>
            {spaces.map((space) => (
              <Link
                key={space.id}
                href={href({ espacio: space.id })}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium",
                  spaceId === space.id
                    ? "bg-foreground text-background"
                    : "border border-border bg-surface text-muted",
                  !space.active && "opacity-60",
                )}
              >
                {space.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {spaces.length === 0 ? (
        <Card className="flex items-center gap-3 p-4 text-sm">
          <CalendarDays size={18} className="shrink-0 text-muted" />
          <span className="text-muted">
            Todavía no cargaste espacios. El calendario funciona igual, pero no
            puede decirte qué sub-salón está libre.{" "}
            <Link href="/panel/espacios" className="text-brand underline">
              Cargar espacios
            </Link>
          </span>
        </Card>
      ) : null}

      {view === "mes" ? (
        <MonthView
          firstOfMonth={firstOfMonth}
          events={events}
          today={today}
          buildDayHref={(dayKey) => href({ vista: "dia", dia: dayKey })}
        />
      ) : (
        <DayView date={day} columns={columns} />
      )}
    </div>
  );
}
