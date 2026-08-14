import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Encabezado de las pantallas de control de acceso.
 *
 * Comparte el ancho con el contenido (`max-w-md`): con el header a lo ancho de
 * la pantalla y la tarjeta centrada, en una notebook el botón de salir quedaba
 * a treinta centímetros de todo lo demás.
 *
 * Los tres accesos usan la misma pastilla, y en pantalla chica se quedan solo
 * con el ícono: el operador entra desde el teléfono.
 */
export function ScannerHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Volver",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Accesos de la derecha. Usar `headerButton` para que se vean iguales. */
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel}
            className={headerButton("shrink-0")}
          >
            <ArrowLeft size={15} />
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 truncate font-semibold">
            {title}
          </div>
          {subtitle ? (
            <p className="truncate text-xs text-muted">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">{children}</div>
      </div>
    </header>
  );
}

/** Estilo común de los accesos del encabezado. */
export function headerButton(extra?: string): string {
  return cn(
    "flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-background hover:text-foreground",
    extra,
  );
}
