import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

import { Scanner } from "@/components/scanner/scanner";
import { requireEventAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatEventDateShort } from "@/lib/format";
import { Role } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function ControlEventoPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  // Un operador DOOR solo puede escanear en los eventos donde está asignado.
  const user = await requireEventAccess(eventId);

  // El atajo al panel solo se ofrece a quien puede entrar: para el rol DOOR
  // sería un link a una pantalla que lo va a rechazar.
  const canManage = user.role === Role.ADMIN || user.role === Role.ORGANIZER;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, eventDate: true, startTime: true },
  });

  if (!event) notFound();

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        {/* Con texto y no solo un ícono: el operador de puerta no tiene por qué
            deducir que una flecha significa "cambiar de evento". */}
        <Link
          href="/control"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted"
        >
          <ArrowLeft size={15} />
          Cambiar
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{event.name}</p>
          <p className="text-xs text-muted">
            {formatEventDateShort(event.eventDate)}
            {event.startTime ? ` · ${event.startTime} hs` : ""}
          </p>
        </div>

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

      <div className="mx-auto w-full max-w-md flex-1 p-4">
        <Scanner eventId={event.id} eventName={event.name} />
      </div>
    </main>
  );
}
