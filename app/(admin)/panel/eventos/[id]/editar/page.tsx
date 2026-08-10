import { notFound } from "next/navigation";

import { DeleteEventForm } from "@/components/events/delete-event-form";
import { EventForm } from "@/components/events/event-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";
import { deleteEventAction, updateEventAction } from "@/lib/actions/events";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";

export const metadata = { title: "Editar evento" };

export default async function EditarEventoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminOrOrganizer();
  const { id } = await params;

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
      _count: { select: { guests: true, checkIns: true } },
    },
  });

  if (!event) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Editar evento" subtitle={event.name} />

      <Card className="p-5">
        <EventForm
          action={updateEventAction.bind(null, event.id)}
          submitLabel="Guardar cambios"
          defaultValues={{
            name: event.name,
            eventDate: toDateInputValue(event.eventDate),
            startTime: event.startTime ?? "",
            endTime: event.endTime ?? "",
            location: event.location ?? "",
            notes: event.notes ?? "",
            status: event.status,
          }}
          cancel={
            <ButtonLink href={`/panel/eventos/${event.id}`} variant="secondary">
              Cancelar
            </ButtonLink>
          }
        />
      </Card>

      <Card className="border-deny/30 p-5">
        <h2 className="font-semibold text-deny">Zona de riesgo</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Eliminar el evento borra también sus invitados, invitaciones e
          ingresos registrados.
        </p>
        <DeleteEventForm
          action={deleteEventAction.bind(null, event.id)}
          eventName={event.name}
          guestCount={event._count.guests}
          checkInCount={event._count.checkIns}
        />
      </Card>
    </div>
  );
}
