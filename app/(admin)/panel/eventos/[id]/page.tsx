import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Download,
  History,
  Pencil,
  ScanLine,
  Users,
} from "lucide-react";

import { DraftBanner } from "@/components/events/draft-banner";
import { EventInfo } from "@/components/events/event-info";
import { EventRegistrationPanel } from "@/components/events/event-registration-panel";
import { EventStaffPanel } from "@/components/events/event-staff-panel";
import {
  CapacityWarning,
  ScheduleConflictWarning,
} from "@/components/events/event-warnings";
import { AddGuestPanel } from "@/components/guests/add-guest-panel";
import { GuestActions } from "@/components/guests/guest-actions";
import { GuestSearch } from "@/components/guests/guest-search";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { createGuestAction } from "@/lib/actions/guests";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  EVENT_STATUS_LABELS,
  formatEventDate,
  formatPhone,
  personFullName,
  toDateInputValue,
} from "@/lib/format";
import {
  deriveStatus,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/invitation-status";
import { registrationUrl } from "@/lib/invitation-url";
import { resolveLocation } from "@/lib/venue";
import { findScheduleConflicts } from "@/lib/schedule";
import { listAssignableStaff, listEventStaff } from "@/lib/staff";
import { getEventStats } from "@/lib/stats";
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
      space: { select: { name: true, address: true } },
      registrationToken: true,
      registrationOpen: true,
      registrationAutoApprove: true,
      registrationMaxPeople: true,
      registrationDeadline: true,
      _count: { select: { guests: { where: { viaRegistration: true } } } },
    },
  });

  if (!event) notFound();

  const [conflicts, assignedStaff, staffCandidates] = await Promise.all([
    findScheduleConflicts({
      spaceId: event.spaceId,
      event,
      excludeEventId: event.id,
    }),
    listEventStaff(id),
    listAssignableStaff(id),
  ]);

  // Busca por nombre, apellido o teléfono. El teléfono se guarda solo con
  // dígitos, así que la consulta normaliza lo que el usuario tipeó.
  const digits = digitsOnly(query);
  const where = query
    ? {
        eventId: id,
        OR: [
          { firstName: { contains: query, mode: "insensitive" as const } },
          { lastName: { contains: query, mode: "insensitive" as const } },
          // El DNI se busca igual que el teléfono: los dos son dígitos y el
          // organizador puede tener a mano cualquiera de los dos.
          ...(digits
            ? [{ phone: { contains: digits } }, { document: { contains: digits } }]
            : []),
        ],
      }
    : { eventId: id };

  // Las estadísticas son del evento completo, no del filtro de búsqueda. El
  // ritmo por hora ya no se consulta acá: vive en la pantalla de ingresos.
  const [guests, stats] = await Promise.all([
    prisma.guest.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        document: true,
        phone: true,
        notes: true,
        viaRegistration: true,
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
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.name}
        // Solo fecha y estado: el detalle completo se lee en la ficha de
        // abajo, donde cada dato tiene su etiqueta. Apilado en el encabezado
        // era una tira de texto separada por puntos.
        subtitle={
          <>
            <Badge tone={event.status === "CANCELLED" ? "deny" : "neutral"}>
              {EVENT_STATUS_LABELS[event.status]}
            </Badge>
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

      <EventInfo
        stats={stats}
        event={{
          eventDate: event.eventDate,
          startTime: event.startTime,
          endTime: event.endTime,
          spaceName: event.space?.name ?? null,
          address: resolveLocation(event),
          maxGuests: event.maxGuests,
          status: event.status,
          notes: event.notes,
        }}
      />

      <EventStaffPanel
        eventId={event.id}
        assigned={assignedStaff}
        candidates={staffCandidates}
      />

      <EventRegistrationPanel
        eventId={event.id}
        settings={{
          capacity: event.maxGuests,
          authorized: stats.capacity,
          open: event.registrationOpen,
          autoApprove: event.registrationAutoApprove,
          maxPeople: event.registrationMaxPeople,
          deadline: event.registrationDeadline
            ? toDateInputValue(event.registrationDeadline)
            : "",
          url: event.registrationToken
            ? registrationUrl(event.registrationToken)
            : null,
          registered: event._count.guests,
        }}
      />

      <section className="flex flex-col gap-3">
        <AddGuestPanel
          action={createGuestAction.bind(null, event.id)}
          search={
            <GuestSearch
              defaultValue={query}
              className="w-64"
              inputClassName="rounded-lg py-2 text-sm"
            />
          }
        />

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
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/panel/eventos/${event.id}/invitados/${guest.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {personFullName(guest)}
                      </Link>
                      {/* Saber quién se anotó solo importa: es el que nadie
                          del salón revisó. */}
                      {guest.viaRegistration ? (
                        <Badge tone="neutral">Formulario</Badge>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted">
                      {guest.document ? `DNI ${guest.document} · ` : ""}
                      {formatPhone(guest.phone)}
                      {inv ? ` · código ${inv.shortCode}` : ""}
                    </p>
                    {guest.notes ? (
                      <p className="mt-0.5 text-xs text-warn">{guest.notes}</p>
                    ) : null}
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
                      guestName={personFullName(guest)}
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
