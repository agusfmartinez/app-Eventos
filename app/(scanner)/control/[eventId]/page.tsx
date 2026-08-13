import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

import { GuestFinder } from "@/components/scanner/guest-finder";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireEventAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatEventDateShort } from "@/lib/format";
import { Role } from "@/lib/generated/prisma/enums";
import { getAssignedStation } from "@/lib/staff";
import { getEventStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * Ficha del evento para el control de acceso. **Solo lectura.**
 *
 * Sirve para el caso concreto de la puerta: alguien dice "yo tendría que estar
 * en la lista" y el operador necesita buscarlo sin poder tocar nada. No hay
 * altas, bajas ni ediciones — para eso está el panel, que el rol DOOR no
 * alcanza. El escaneo tampoco pasa por acá: se hace en /control, donde el QR
 * resuelve el evento.
 */
export default async function ControlEventoPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  // Un operador DOOR solo alcanza los eventos donde está asignado.
  const user = await requireEventAccess(eventId);
  const canManage = user.role === Role.ADMIN || user.role === Role.ORGANIZER;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      space: { select: { name: true } },
    },
  });

  if (!event) notFound();

  const [stats, station, guests] = await Promise.all([
    getEventStats(eventId),
    getAssignedStation(eventId, user.id),
    // Se traen todos: el filtrado pasa en el cliente, así buscar no depende
    // de la red. Un evento tiene cientos de invitados, no millones.
    prisma.guest.findMany({
      where: { eventId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        invitation: {
          select: { status: true, maxPeople: true, enteredCount: true },
        },
      },
    }),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link
          href="/control"
          aria-label="Volver al escáner"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted"
        >
          <ArrowLeft size={15} />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{event.name}</p>
          <p className="text-xs text-muted">
            {formatEventDateShort(event.eventDate)}
            {event.startTime ? ` · ${event.startTime} hs` : ""}
            {event.space ? ` · ${event.space.name}` : ""}
            {station ? ` · ${station}` : ""}
          </p>
        </div>

        <ThemeToggle />

        {canManage ? (
          <Link
            href={`/panel/eventos/${event.id}`}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted"
          >
            <LayoutDashboard size={15} />
            Panel
          </Link>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Ingresaron" value={stats.entered} tone="ok" />
          <Stat label="Autorizadas" value={stats.capacity} />
          <Stat
            label="Faltan"
            value={Math.max(0, stats.capacity - stats.entered)}
          />
        </div>

        <GuestFinder guests={guests} />
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "ok";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p
        className={`text-2xl font-bold tabular-nums ${tone === "ok" ? "text-ok" : ""}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
