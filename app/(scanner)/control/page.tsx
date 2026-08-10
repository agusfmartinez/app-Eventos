import Link from "next/link";
import { CalendarOff, ScanLine } from "lucide-react";

import { logoutAction } from "@/lib/actions/session";
import { requireAuth } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatEventDateShort, todayAtVenue, toDateInputValue } from "@/lib/format";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Control de acceso" };
export const dynamic = "force-dynamic";

/**
 * Selector de evento. Vive fuera del grupo (admin) a propósito: el rol DOOR
 * tiene que entrar acá y el layout del panel lo rechazaría.
 */
export default async function ControlPage() {
  const user = await requireAuth();

  const isStaffOnly = user.role === Role.DOOR;

  const events = await prisma.event.findMany({
    where: {
      // Un operador de puerta solo ve los eventos donde está asignado.
      // Administradores y organizadores ven todos.
      ...(isStaffOnly ? { staff: { some: { userId: user.id } } } : {}),
      status: { in: ["PUBLISHED", "IN_PROGRESS"] },
    },
    orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      name: true,
      eventDate: true,
      startTime: true,
      location: true,
      _count: { select: { guests: true } },
    },
  });

  const today = todayAtVenue();

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanLine size={20} className="text-brand" />
          <span className="font-semibold">Control de acceso</span>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted">
            Salir
          </button>
        </form>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 p-4">
        <p className="mb-4 text-sm text-muted">
          Hola {user.fullName}. Elegí el evento donde estás trabajando.
        </p>

        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <CalendarOff size={28} className="text-muted" />
            <p className="font-medium">No hay eventos disponibles</p>
            <p className="max-w-xs text-sm text-muted">
              {isStaffOnly
                ? "No estás asignado a ningún evento publicado. Pedile a un organizador que te asigne."
                : "Publicá un evento desde el panel para poder controlar el ingreso."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event) => {
              const isToday = toDateInputValue(event.eventDate) === today;

              return (
                <li key={event.id}>
                  <Link
                    href={`/control/${event.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 active:border-brand"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{event.name}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {formatEventDateShort(event.eventDate)}
                        {event.startTime ? ` · ${event.startTime} hs` : ""}
                        {` · ${event._count.guests} invitados`}
                      </p>
                    </div>
                    {isToday ? (
                      <span className="shrink-0 rounded-full bg-ok-surface px-2.5 py-1 text-xs font-semibold text-ok">
                        HOY
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
