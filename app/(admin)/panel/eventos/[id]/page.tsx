import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Download,
  History,
  Pencil,
  ScanLine,
  Search,
  StickyNote,
  Users,
} from "lucide-react";

import { DraftBanner } from "@/components/events/draft-banner";
import { EventDashboard } from "@/components/events/event-dashboard";
import {
  CapacityWarning,
  ScheduleConflictWarning,
} from "@/components/events/event-warnings";
import { AddGuestPanel } from "@/components/guests/add-guest-panel";
import { GuestActions } from "@/components/guests/guest-actions";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { createGuestAction } from "@/lib/actions/guests";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  EVENT_STATUS_LABELS,
  formatEventDate,
  formatPhone,
  guestFullName,
} from "@/lib/format";
import {
  deriveStatus,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/invitation-status";
import { findScheduleConflicts } from "@/lib/schedule";
import { getEventStats, getHourlyEntries } from "@/lib/stats";
import { digitsOnly } from "@/lib/validators/guest";

export const dynamic = "force-dynamic";

export default async function EventoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminOrOrganizer();
  const { id } = await params;
  const { q = "" } = await searchParams;
  const query = q.trim();

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      location: true,
      notes: true,
      status: true,
      spaceId: true,
      maxGuests: true,
      space: { select: { name: true } },
    },
  });

  if (!event) notFound();

  const conflicts = await findScheduleConflicts({
    spaceId: event.spaceId,
    event,
    excludeEventId: event.id,
  });

  // Busca por nombre, apellido o teléfono. El teléfono se guarda solo con
  // dígitos, así que la consulta normaliza lo que el usuario tipeó.
  const digits = digitsOnly(query);
  const where = query
    ? {
        eventId: id,
        OR: [
          { firstName: { contains: query, mode: "insensitive" as const } },
          { lastName: { contains: query, mode: "insensitive" as const } },
          ...(digits ? [{ phone: { contains: digits } }] : []),
        ],
      }
    : { eventId: id };

  // Las estadísticas son del evento completo, no del filtro de búsqueda.
  const [guests, stats, hourly] = await Promise.all([
    prisma.guest.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        invitation: {
          select: {
            status: true,
            maxPeople: true,
            enteredCount: true,
            shortCode: true,
          },
        },
      },
    }),
    getEventStats(id),
    getHourlyEntries(id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.name}
        subtitle={
          <>
            {event.space ? `${event.space.name} · ` : ""}
            {formatEventDate(event.eventDate)}
            {event.startTime ? ` · ${event.startTime}` : ""}
            {event.endTime ? ` a ${event.endTime} hs` : event.startTime ? " hs" : ""}
            {event.location ? ` · ${event.location}` : ""}
            <span className="ml-2">
              <Badge
                tone={event.status === "CANCELLED" ? "deny" : "neutral"}
              >
                {EVENT_STATUS_LABELS[event.status]}
              </Badge>
            </span>
          </>
        }
        actions={
          <>
            <ButtonLink
              href={`/panel/eventos/${event.id}/ingresos`}
              variant="secondary"
            >
              <History size={16} />
              Ingresos
            </ButtonLink>
            <ButtonLink
              href={`/panel/eventos/${event.id}/export/invitados`}
              variant="secondary"
            >
              <Download size={16} />
              Exportar
            </ButtonLink>
            <ButtonLink href={`/control/${event.id}`} variant="secondary">
              <ScanLine size={16} />
              Control de acceso
            </ButtonLink>
            <ButtonLink
              href={`/panel/eventos/${event.id}/editar`}
              variant="secondary"
            >
              <Pencil size={16} />
              Editar
            </ButtonLink>
          </>
        }
      />

      {event.status === "DRAFT" ? <DraftBanner eventId={event.id} /> : null}

      {event.space ? (
        <ScheduleConflictWarning
          conflicts={conflicts}
          spaceName={event.space.name}
        />
      ) : null}

      {event.maxGuests ? (
        <CapacityWarning
          capacity={event.maxGuests}
          authorized={stats.capacity}
        />
      ) : null}

      {event.notes ? (
        <Card className="p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <StickyNote size={15} className="text-muted" />
            Información adicional
          </h2>
          <p className="mt-1.5 text-sm whitespace-pre-wrap">{event.notes}</p>
        </Card>
      ) : null}

      <EventDashboard stats={stats} hourly={hourly} />

      <AddGuestPanel action={createGuestAction.bind(null, event.id)} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Invitados</h2>

          <form className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
              />
              <Input
                name="q"
                defaultValue={query}
                placeholder="Buscar por nombre o teléfono"
                className="w-64 pl-8"
                aria-label="Buscar invitados"
              />
            </div>
          </form>
        </div>

        {guests.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={
              query
                ? "Ningún invitado coincide con la búsqueda"
                : "Todavía no hay invitados"
            }
            description={
              query
                ? `No se encontró nada para “${query}”.`
                : "Agregá el primer invitado con el botón de arriba."
            }
            action={
              query ? (
                <ButtonLink
                  href={`/panel/eventos/${event.id}`}
                  variant="secondary"
                >
                  Limpiar búsqueda
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <Card className="divide-y divide-border">
            {guests.map((guest) => {
              const inv = guest.invitation;
              const derived = inv ? deriveStatus(inv) : null;

              return (
                <div
                  key={guest.id}
                  className="flex flex-wrap items-center gap-3 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/panel/eventos/${event.id}/invitados/${guest.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {guestFullName(guest)}
                    </Link>
                    <p className="text-sm text-muted">
                      {formatPhone(guest.phone)}
                      {inv ? ` · código ${inv.shortCode}` : ""}
                    </p>
                  </div>

                  {inv ? (
                    <div className="flex items-center gap-3">
                      {/* String único: interpolar por separado hace que React
                          intercale marcadores de comentario en el HTML. */}
                      <span className="text-sm tabular-nums text-muted">
                        {`${inv.enteredCount}/${inv.maxPeople}`}
                      </span>
                      {derived ? (
                        <Badge tone={STATUS_TONES[derived]}>
                          {STATUS_LABELS[derived]}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}

                  {inv ? (
                    <GuestActions
                      guestId={guest.id}
                      guestName={guestFullName(guest)}
                      status={inv.status}
                    />
                  ) : null}
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
