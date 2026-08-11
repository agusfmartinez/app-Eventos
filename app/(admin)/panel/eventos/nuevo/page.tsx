import { EventForm } from "@/components/events/event-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";
import { createEventAction } from "@/lib/actions/events";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const metadata = { title: "Nuevo evento" };
export const dynamic = "force-dynamic";

export default async function NuevoEventoPage() {
  await requireAdminOrOrganizer();

  // Solo los activos: un espacio desactivado no debería ofrecerse para eventos
  // nuevos, aunque siga figurando en los viejos.
  const spaces = await prisma.space.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, capacity: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nuevo evento" />

      <Card className="p-5">
        <EventForm
          action={createEventAction}
          spaces={spaces}
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
