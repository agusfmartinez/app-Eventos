"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { publishEventAction } from "@/lib/actions/events";

/**
 * Un evento en borrador no aparece en el control de acceso — es a propósito,
 * para que no se pueda dejar entrar gente a un evento a medio armar. Pero sin
 * este aviso el organizador se entera recién cuando el operador de puerta no
 * encuentra el evento, que es el peor momento posible.
 */
export function DraftBanner({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await publishEventAction(eventId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-surface px-4 py-3">
      <AlertTriangle size={20} className="shrink-0 text-warn" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-warn">
          Este evento está en borrador
        </p>
        <p className="text-sm text-warn/90">
          No aparece en el control de acceso. Publicalo antes del evento para
          que el personal de puerta pueda escanear.
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-sm text-deny">
            {error}
          </p>
        ) : null}
      </div>

      <Button onClick={publish} disabled={pending} size="sm">
        {pending ? "Publicando…" : "Publicar evento"}
      </Button>
    </div>
  );
}
