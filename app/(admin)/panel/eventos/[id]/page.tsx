import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ScanLine, Search, Users } from "lucide-react";

import { AddGuestPanel } from "@/components/guests/add-guest-panel";
import { GuestActions } from "@/components/guests/guest-actions";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { createGuestAction } from "@/lib/actions/guests";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  EVENT_STATUS_LABELS,
  formatEventDate,
  formatPhone,
  guestFullName,
} from "@/lib/format";
import { InvitationStatus } from "@/lib/generated/prisma/enums";
import {
  deriveStatus,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/invitation-status";
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
    },
  });

  if (!event) notFound();

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

  const [guests, allInvitations] = await Promise.all([
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
    // Stats sobre el evento completo, no sobre el filtro de búsqueda.
    prisma.invitation.findMany({
      where: { eventId: id },
      select: { status: true, maxPeople: true, enteredCount: true },
    }),
  ]);

  const stats = {
    total: allInvitations.length,
    enabled: allInvitations.filter((i) => i.status === InvitationStatus.ENABLED)
      .length,
    pending: allInvitations.filter((i) => i.status === InvitationStatus.PENDING)
      .length,
    blocked: allInvitations.filter((i) => i.status === InvitationStatus.BLOCKED)
      .length,
    entered: allInvitations.reduce((sum, i) => sum + i.enteredCount, 0),
    capacity: allInvitations.reduce((sum, i) => sum + i.maxPeople, 0),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.name}
        subtitle={
          <>
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
            <ButtonLink href={`/control?evento=${event.id}`} variant="secondary">
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

      {event.notes ? (
        <Card className="p-4 text-sm whitespace-pre-wrap">{event.notes}</Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Invitados" value={stats.total} />
        <StatCard label="Habilitados" value={stats.enabled} />
        <StatCard label="Pendientes" value={stats.pending} tone="warn" />
        <StatCard label="Bloqueados" value={stats.blocked} tone="deny" />
        <StatCard
          label="Ingresaron"
          value={`${stats.entered}/${stats.capacity}`}
          tone="ok"
        />
      </div>

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
                      <span className="text-sm tabular-nums text-muted">
                        {inv.enteredCount}/{inv.maxPeople}
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
