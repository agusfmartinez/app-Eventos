import Link from "next/link";
import { CalendarDays, CalendarOff, LayoutDashboard, ScanLine } from "lucide-react";

import { Scanner } from "@/components/scanner/scanner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { logoutAction } from "@/lib/actions/session";
import { requireAuth } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import { listScannableEvents } from "@/lib/scanning";

export const metadata = { title: "Control de acceso" };
export const dynamic = "force-dynamic";

/**
 * Control de acceso. Vive fuera del grupo (admin) a propósito: el rol DOOR
 * tiene que entrar acá y el layout del panel lo rechazaría.
 *
 * No hay selector de evento: el QR lo resuelve. La lista de abajo es contexto
 * —qué se está atendiendo esta noche— y el acceso a la ficha de cada evento en
 * modo lectura, para cuando alguien dice "yo tendría que estar en la lista".
 */
export default async function ControlPage() {
  const user = await requireAuth();

  const isStaffOnly = user.role === Role.DOOR;
  const events = await listScannableEvents(user);

  // Puestos con los que está asignado esta noche. Puede haber más de uno si
  // cubre dos eventos a la vez.
  const assignments = await prisma.eventStaff.findMany({
    where: { userId: user.id, eventId: { in: events.map((e) => e.id) } },
    select: { stationLabel: true },
  });

  const stations = [
    ...new Set(
      assignments
        .map((a) => a.stationLabel?.trim())
        .filter((label): label is string => Boolean(label)),
    ),
  ];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanLine size={20} className="text-brand" />
          <span className="font-semibold">Control de acceso</span>
        </div>

        <div className="flex items-center gap-2">
          {/* La lista vive en su propia pantalla y no debajo de la cámara: con
              el escaneo libre es una consulta ocasional, y ahí abajo solo
              empujaba el sello fuera del viewport del celular. */}
          <Link
            href="/control/eventos"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted"
          >
            <CalendarDays size={15} />
            Eventos
          </Link>
          <ThemeToggle />
          {!isStaffOnly ? (
            <Link
              href="/panel"
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted"
            >
              <LayoutDashboard size={15} />
              Panel
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-muted">
              Salir
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-4">
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <CalendarOff size={28} className="text-muted" />
            <p className="font-medium">No hay eventos abiertos ahora</p>
            <p className="max-w-xs text-sm text-muted">
              {isStaffOnly
                ? "No estás asignado a ningún evento de esta noche. Pedile a un organizador que te asigne."
                : "Publicá un evento para hoy desde el panel para poder controlar el ingreso."}
            </p>
          </div>
        ) : (
          <Scanner stations={stations} />
        )}
      </div>
    </main>
  );
}
