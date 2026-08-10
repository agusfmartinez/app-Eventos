import { CalendarDays } from "lucide-react";

import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const metadata = { title: "Eventos" };

// El panel muestra el estado real de la base, no una caché.
export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function PanelPage() {
  await requireAdminOrOrganizer();

  const [eventCount, guestCount, checkInCount] = await Promise.all([
    prisma.event.count(),
    prisma.guest.count(),
    prisma.checkIn.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Eventos</h1>
        <p className="mt-1 text-sm text-muted">
          Panel administrativo del salón.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Eventos" value={eventCount} />
        <StatCard label="Invitados" value={guestCount} />
        <StatCard label="Ingresos registrados" value={checkInCount} />
      </div>

      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <CalendarDays className="text-muted" size={28} />
        <p className="font-medium">Todavía no hay eventos</p>
        <p className="max-w-sm text-sm text-muted">
          El alta y la edición de eventos llegan en la Fase 2. La base, la
          autenticación y los roles ya están funcionando.
        </p>
      </div>
    </div>
  );
}
