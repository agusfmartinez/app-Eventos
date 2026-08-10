import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Scanner } from "@/components/scanner/scanner";
import { requireEventAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatEventDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ControlEventoPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  // Un operador DOOR solo puede escanear en los eventos donde está asignado.
  await requireEventAccess(eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, eventDate: true, startTime: true },
  });

  if (!event) notFound();

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link
          href="/control"
          aria-label="Cambiar de evento"
          className="shrink-0 text-muted"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0">
          <p className="truncate font-semibold">{event.name}</p>
          <p className="text-xs text-muted">
            {formatEventDateShort(event.eventDate)}
            {event.startTime ? ` · ${event.startTime} hs` : ""}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 p-4">
        <Scanner eventId={event.id} eventName={event.name} />
      </div>
    </main>
  );
}
