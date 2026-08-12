import { notFound } from "next/navigation";

import { DeleteEventForm } from "@/components/events/delete-event-form";
import { EventForm } from "@/components/events/event-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";
import { deleteEventAction, updateEventAction } from "@/lib/actions/events";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Editar evento" };
export const dynamic = "force-dynamic";

export default async function EditarEventoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireAdminOrOrganizer();
  const { id } = await params;

  const [event, activeSpaces] = await Promise.all([
    prisma.event.findUnique({
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
        space: { select: { id: true, name: true, capacity: true } },
        _count: { select: { guests: true, checkIns: true } },
      },
    }),
    prisma.space.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, capacity: true },
    }),
  ]);

  if (!event) notFound();

  // El espacio actual se agrega aunque esté desactivado: si no apareciera en
  // el selector, editar cualquier otro campo borraría la asignación al guardar.
  const spaces = [...activeSpaces];
  if (event.space && !spaces.some((s) => s.id === event.space!.id)) {
    spaces.push(event.space);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Editar evento" subtitle={event.name} />

      <Card className="p-5">
        <EventForm
          action={updateEventAction.bind(null, event.id)}
          spaces={spaces}
          submitLabel="Guardar cambios"
          defaultValues={{
            name: event.name,
            spaceId: event.spaceId ?? "",
            maxGuests: event.maxGuests?.toString() ?? "",
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

      {/* Borrar es la única operación que destruye historial de ingresos, así
          que queda reservada a los administradores. Al organizador ni se le
          muestra: ofrecerle un botón que va a fallar es peor que no tenerlo. */}
      {actor.role === Role.ADMIN ? (
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
      ) : (
        <p className="text-sm text-muted">
          Para dar de baja este evento sin perder su historial, cambiale el
          estado a <strong>Cancelado</strong>. Eliminarlo definitivamente lo
          puede hacer solo un administrador.
        </p>
      )}
    </div>
  );
}
