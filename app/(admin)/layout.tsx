import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarRange,
  DoorOpen,
  ExternalLink,
  LogOut,
  ScanLine,
  Ticket,
  Users,
} from "lucide-react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { logoutAction } from "@/lib/actions/session";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { Role } from "@/lib/generated/prisma/enums";

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
          <Link
            href="/panel"
            className="shrink-0 font-semibold whitespace-nowrap"
          >
            Salón de Eventos
          </Link>

          {/* Solo las secciones del panel. Los accesos que no son secciones
              —la pantalla pública, el tema, la sesión— viven a la derecha:
              mezclarlos hacía que la fila se partiera en dos renglones. */}
          <nav className="flex min-w-0 items-center gap-0.5 text-sm [&_a]:whitespace-nowrap">
            <Link
              href="/panel"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              <CalendarDays size={16} />
              Eventos
            </Link>
            <Link
              href="/panel/calendario"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              <CalendarRange size={16} />
              Calendario
            </Link>
            <Link
              href="/panel/espacios"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              <DoorOpen size={16} />
              Espacios
            </Link>
            {user.role === Role.ADMIN ? (
              <Link
                href="/panel/usuarios"
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
              >
                <Users size={16} />
                Usuarios
              </Link>
            ) : null}
            <Link
              href="/control"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              <ScanLine size={16} />
              Recepción
            </Link>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span className="mr-2 hidden text-sm whitespace-nowrap text-muted lg:inline">
              {user.fullName}
            </span>

            {/* Pantalla pública: se abre aparte para no perder el panel, y
                sobre todo para poder copiar el link y pasárselo a alguien que
                perdió su entrada. */}
            <a
              href="/mi-entrada"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir la pantalla pública para recuperar una entrada"
              title="Pantalla pública para que un invitado recupere su entrada"
              className="relative flex items-center rounded-md p-2 text-muted hover:bg-background hover:text-foreground"
            >
              <Ticket size={16} />
              <ExternalLink
                size={10}
                className="absolute top-1 right-0.5 opacity-70"
              />
            </a>

            <ThemeToggle />
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted hover:bg-background hover:text-foreground"
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
