import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  EVENT_STATUS_LABELS,
  formatEventDateShort,
  todayAtVenue,
  toDateInputValue,
} from "@/lib/format";
import { EventStatus } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Eventos" };
export const dynamic = "force-dynamic";

const statusTone = {
  DRAFT: "neutral",
  PUBLISHED: "ok",
  IN_PROGRESS: "warn",
  FINISHED: "neutral",
  CANCELLED: "deny",
} as const;

type EventRow = {
  id: string;
  name: string;
  eventDate: Date;
  startTime: string | null;
  status: EventStatus;
  guests: number;
  entered: number;
};

function EventCard({ event }: { event: EventRow }) {
  return (
    <Link
      href={`/panel/eventos/${event.id}`}
      className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{event.name}</p>
          <p className="mt-0.5 text-sm text-muted">
            {formatEventDateShort(event.eventDate)}
            {event.startTime ? ` · ${event.startTime} hs` : ""}
          </p>
        </div>
        <Badge tone={statusTone[event.status]}>
          {EVENT_STATUS_LABELS[event.status]}
        </Badge>
      </div>

      <div className="mt-3 flex gap-4 text-sm">
        <span className="text-muted">
          <strong className="text-foreground tabular-nums">{event.guests}</strong>{" "}
          invitados
        </span>
        <span className="text-muted">
          <strong className="text-foreground tabular-nums">{event.entered}</strong>{" "}
          ingresaron
        </span>
      </div>
    </Link>
  );
}

function Section({ title, events }: { title: string; events: EventRow[] }) {
  if (events.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    </section>
  );
}

export default async function PanelPage() {
  await requireAdminOrOrganizer();

  const [events, enteredByEvent] = await Promise.all([
    prisma.event.findMany({
      orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        name: true,
        eventDate: true,
        startTime: true,
        status: true,
        _count: { select: { guests: true } },
      },
    }),
    // Una sola agregación en vez de una consulta por evento.
    prisma.invitation.groupBy({
      by: ["eventId"],
      _sum: { enteredCount: true },
    }),
  ]);

  const enteredMap = new Map(
    enteredByEvent.map((row) => [row.eventId, row._sum.enteredCount ?? 0]),
  );

  const rows: EventRow[] = events.map((e) => ({
    id: e.id,
    name: e.name,
    eventDate: e.eventDate,
    startTime: e.startTime,
    status: e.status,
    guests: e._count.guests,
    entered: enteredMap.get(e.id) ?? 0,
  }));

  const today = todayAtVenue();
  const hoy = rows.filter((e) => toDateInputValue(e.eventDate) === today);
  const proximos = rows.filter((e) => toDateInputValue(e.eventDate) > today);
  const pasados = rows
    .filter((e) => toDateInputValue(e.eventDate) < today)
    .reverse();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Eventos"
        subtitle="Panel administrativo del salón."
        actions={
          <ButtonLink href="/panel/eventos/nuevo">
            <Plus size={16} />
            Nuevo evento
          </ButtonLink>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="Todavía no hay eventos"
          description="Creá el primer evento para empezar a cargar invitados."
          action={
            <ButtonLink href="/panel/eventos/nuevo">
              <Plus size={16} />
              Crear evento
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Section title="Hoy" events={hoy} />
          <Section title="Próximos" events={proximos} />
          <Section title="Pasados" events={pasados} />
        </div>
      )}
    </div>
  );
}
