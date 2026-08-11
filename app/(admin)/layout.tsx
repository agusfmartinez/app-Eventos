import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, DoorOpen, LogOut, ScanLine } from "lucide-react";

import { logoutAction } from "@/lib/actions/session";
import { requireAdminOrOrganizer } from "@/lib/authz";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Guard del panel completo. Cada Server Action revalida igual por su cuenta:
  // proteger solo el layout no alcanza, porque las acciones son endpoints que
  // se pueden invocar directamente sin pasar por esta página.
  const user = await requireAdminOrOrganizer();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/panel" className="font-semibold">
            Salón de Eventos
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/panel"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              <CalendarDays size={16} />
              Eventos
            </Link>
            <Link
              href="/panel/espacios"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              <DoorOpen size={16} />
              Espacios
            </Link>
            <Link
              href="/control"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              <ScanLine size={16} />
              Recepción
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              {user.fullName}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
