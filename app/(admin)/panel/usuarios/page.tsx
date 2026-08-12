import { UserList } from "@/components/users/user-list";
import { PageHeader } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  // Solo administradores: quien puede crear cuentas puede crearse un admin.
  const actor = await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      mustChangePassword: true,
      _count: { select: { staffAt: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuarios"
        subtitle="Cuentas del personal del salón."
      />

      <UserList
        currentUserId={actor.id}
        users={users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          active: u.active,
          mustChangePassword: u.mustChangePassword,
          assignedEvents: u._count.staffAt,
        }))}
      />
    </div>
  );
}
