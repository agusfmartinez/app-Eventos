"use client";

import { useState, useTransition } from "react";
import { Ban, CheckCircle2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteGuestAction,
  setInvitationStatusAction,
} from "@/lib/actions/guests";
import { InvitationStatus } from "@/lib/generated/prisma/enums";

export function GuestActions({
  guestId,
  guestName,
  status,
}: {
  guestId: string;
  guestName: string;
  status: InvitationStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const blocked = status === InvitationStatus.BLOCKED;

  function toggleStatus() {
    setError(null);
    startTransition(async () => {
      const result = await setInvitationStatusAction(
        guestId,
        blocked ? InvitationStatus.ENABLED : InvitationStatus.BLOCKED,
      );
      if (result.error) setError(result.error);
    });
  }

  function remove() {
    if (!confirm(`¿Eliminar a ${guestName}? No se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteGuestAction(guestId);
      // El caso esperado: el invitado ya registró ingresos y borrarlo se
      // rechaza para no romper el historial.
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleStatus}
          disabled={pending}
          title={blocked ? "Habilitar" : "Bloquear"}
        >
          {blocked ? <CheckCircle2 size={15} /> : <Ban size={15} />}
          <span className="hidden sm:inline">
            {blocked ? "Habilitar" : "Bloquear"}
          </span>
        </Button>

        <Button
          variant="dangerGhost"
          size="sm"
          onClick={remove}
          disabled={pending}
          title="Eliminar"
        >
          <Trash2 size={15} />
        </Button>
      </div>

      {error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-deny">
          {error}
        </p>
      ) : null}
    </div>
  );
}
