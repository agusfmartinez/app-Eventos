import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { GuestDetails } from "@/components/guests/guest-details";
import { InvitationCard } from "@/components/invitations/invitation-card";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { updateGuestAction } from "@/lib/actions/guests";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatDateTime, personFullName } from "@/lib/format";
import { InvitationStatus } from "@/lib/generated/prisma/enums";
import {
  deriveStatus,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/invitation-status";

export const dynamic = "force-dynamic";

export default async function InvitadoPage({
  params,
}: {
  params: Promise<{ id: string; guestId: string }>;
}) {
  await requireAdminOrOrganizer();
  const { id, guestId } = await params;

  const guest = await prisma.guest.findFirst({
    // eventId en el where, no solo el guestId: si no, cambiando el id del
    // evento en la URL se podría abrir un invitado de otro evento.
    where: { id: guestId, eventId: id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      document: true,
      phone: true,
      notes: true,
      viaRegistration: true,
      createdAt: true,
      event: {
        select: {
          id: true,
          name: true,
          eventDate: true,
          startTime: true,
          location: true,
          space: { select: { address: true } },
        },
      },
      invitation: {
        select: {
          token: true,
          shortCode: true,
          maxPeople: true,
          enteredCount: true,
          status: true,
          revokedAt: true,
        },
      },
      checkIns: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          peopleCount: true,
          createdAt: true,
          stationLabel: true,
          operator: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!guest) notFound();

  const inv = guest.invitation;
  const derived = inv ? deriveStatus(inv) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={personFullName(guest)}
        subtitle={
          <>
            {`Evento: ${guest.event.name}`}
            {inv ? ` - Código: ${inv.shortCode}` : ""}
            {derived ? (
              <span className="ml-2">
                <Badge tone={STATUS_TONES[derived]}>
                  {STATUS_LABELS[derived]}
                </Badge>
              </span>
            ) : null}
          </>
        }
        actions={
          <ButtonLink href={`/panel/eventos/${guest.event.id}`} variant="secondary">
            <ArrowLeft size={16} />
          </ButtonLink>
        }
      />

      {inv ? (
        <InvitationCard
          guestId={guest.id}
          guestName={personFullName(guest)}
          phone={guest.phone}
          token={inv.token}
          shortCode={inv.shortCode}
          maxPeople={inv.maxPeople}
          event={guest.event}
        />
      ) : null}

      <GuestDetails
        action={updateGuestAction.bind(null, guest.id)}
        viaRegistration={guest.viaRegistration}
        hasInvitation={inv !== null}
        values={{
          firstName: guest.firstName,
          lastName: guest.lastName,
          document: guest.document ?? "",
          phone: guest.phone ?? "",
          notes: guest.notes ?? "",
          maxPeople: inv?.maxPeople ?? 1,
          status: inv?.status ?? InvitationStatus.ENABLED,
        }}
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Historial de ingresos</h2>

        {guest.checkIns.length === 0 ? (
          <Card className="p-4 text-sm text-muted">
            Todavía no registró ingresos.
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {guest.checkIns.map((checkIn) => (
              <div
                key={checkIn.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  <strong className="tabular-nums">
                    {checkIn.peopleCount}
                  </strong>{" "}
                  {checkIn.peopleCount === 1 ? "persona" : "personas"}
                </span>
                <span className="text-muted">
                  {formatDateTime(checkIn.createdAt)}
                  {checkIn.stationLabel ? ` · ${checkIn.stationLabel}` : ""}
                  {checkIn.operator
                    ? ` · ${personFullName(checkIn.operator)}`
                    : ""}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <p className="text-xs text-muted">
        Invitado creado el {formatDateTime(guest.createdAt)}.
      </p>
    </div>
  );
}
