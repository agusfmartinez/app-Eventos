import { EventForm } from "@/components/events/event-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";
import { createEventAction } from "@/lib/actions/events";
import { requireAdminOrOrganizer } from "@/lib/authz";

export const metadata = { title: "Nuevo evento" };

export default async function NuevoEventoPage() {
  await requireAdminOrOrganizer();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nuevo evento" />

      <Card className="p-5">
        <EventForm
          action={createEventAction}
          submitLabel="Crear evento"
          cancel={
            <ButtonLink href="/panel" variant="secondary">
              Cancelar
            </ButtonLink>
          }
        />
      </Card>
    </div>
  );
}
