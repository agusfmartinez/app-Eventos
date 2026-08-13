import Link from "next/link";
import { ArrowLeft, CalendarOff, ChevronRight } from "lucide-react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireAuth } from "@/lib/authz";
import { EVENT_STATUS_LABELS, formatEventDateShort } from "@/lib/format";
import { listAccessibleEvents } from "@/lib/scanning";

export const metadata = { title: "Eventos" };
export const dynamic = "force-dynamic";

/**
 * Los eventos que el operador puede consultar. **Solo lectura.**
 *
 * Es el equivalente del panel para recepción: entrar a un evento y buscar
 * gente. No escanea —eso pasa en /control, donde el QR resuelve el evento— y
 * no tiene ninguna acción.
 */
export default async function ControlEventosPage() {
  const user = await requireAuth();
  const events = await listAccessibleEvents(user);

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

        <p className="min-w-0 flex-1 truncate font-semibold">Eventos</p>

        <ThemeToggle />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-4">
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <CalendarOff size={28} className="text-muted" />
            <p className="font-medium">No hay eventos para mostrar</p>
            <p className="max-w-xs text-sm text-muted">
              Acá aparecen los eventos a los que tenés acceso, desde ayer en
              adelante.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/control/${event.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 active:border-brand"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{event.name}</span>
                      {event.open ? (
                        <span className="shrink-0 rounded-full bg-ok-surface px-2 py-0.5 text-xs font-semibold text-ok">
                          ABIERTO
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatEventDateShort(event.eventDate)}
                      {event.startTime ? ` · ${event.startTime} hs` : ""}
                      {event.spaceName ? ` · ${event.spaceName}` : ""}
                      {` · ${event.guestCount} invitados`}
                      {event.status !== "PUBLISHED" && event.status !== "IN_PROGRESS"
                        ? ` · ${EVENT_STATUS_LABELS[event.status]}`
                        : ""}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
