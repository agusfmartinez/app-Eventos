import type { Metadata } from "next";

import { TicketLookup } from "@/components/registration/ticket-lookup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi entrada",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Recuperación de la entrada para quien perdió el link.
 *
 * Pide DNI **y** apellido. Con el DNI solo, esta pantalla sería un buscador de
 * entradas ajenas: alcanzaría con probar documentos. La acción además limita
 * los intentos por IP y contesta lo mismo cuando no encuentra, sin decir si
 * falló el DNI o el apellido.
 */
export default function MiEntradaPage() {
  return (
    <main
      data-theme="light"
      className="flex flex-1 items-center justify-center bg-background p-4 text-foreground"
    >
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="text-xl font-bold">Buscar mi entrada</h1>
          <p className="mt-1 mb-5 text-sm text-muted">
            Completa con tus datos de registro y buscá tu entrada.
          </p>

          <TicketLookup />
        </div>
      </div>
    </main>
  );
}
