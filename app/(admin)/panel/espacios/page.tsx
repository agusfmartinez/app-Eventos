import { SpaceList } from "@/components/spaces/space-list";
import { PageHeader } from "@/components/ui/misc";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const metadata = { title: "Espacios" };
export const dynamic = "force-dynamic";

export default async function EspaciosPage() {
  await requireAdminOrOrganizer();

  const spaces = await prisma.space.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      capacity: true,
      notes: true,
      active: true,
      _count: { select: { events: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Espacios del salón"
        subtitle="Los ambientes que se alquilan por separado y pueden tener eventos al mismo tiempo."
      />

      <SpaceList
        spaces={spaces.map((s) => ({
          id: s.id,
          name: s.name,
          capacity: s.capacity,
          notes: s.notes,
          active: s.active,
          eventCount: s._count.events,
        }))}
      />
    </div>
  );
}
