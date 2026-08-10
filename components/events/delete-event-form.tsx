"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { emptyFormState, type FormState } from "@/lib/form-state";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Eliminando…" : "Eliminar definitivamente"}
    </Button>
  );
}

export function DeleteEventForm({
  action,
  eventName,
  guestCount,
  checkInCount,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  eventName: string;
  guestCount: number;
  checkInCount: number;
}) {
  const [state, formAction] = useActionState(action, emptyFormState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="dangerGhost" onClick={() => setOpen(true)}>
        Eliminar evento
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm">
        Se van a borrar <strong>{guestCount}</strong> invitados con sus
        invitaciones
        {checkInCount > 0 ? (
          <>
            {" "}
            y <strong>{checkInCount}</strong> ingresos ya registrados
          </>
        ) : null}
        . Esta acción no se puede deshacer.
      </p>

      {checkInCount > 0 ? (
        <p className="rounded-lg bg-warn-surface px-3 py-2 text-sm text-warn">
          Este evento ya tiene ingresos registrados. Si solo querés darlo de
          baja sin perder el historial, cambiale el estado a “Cancelado” en vez
          de eliminarlo.
        </p>
      ) : null}

      <FormError message={state.error} />

      <Field
        label={`Escribí “${eventName}” para confirmar`}
        htmlFor="confirmName"
        error={state.fieldErrors?.confirmName}
      >
        <Input
          id="confirmName"
          name="confirmName"
          autoComplete="off"
          error={state.fieldErrors?.confirmName}
        />
      </Field>

      <div className="flex gap-2">
        <Submit />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
