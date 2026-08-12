"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { GuestForm } from "@/components/guests/guest-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import type { FormState } from "@/lib/form-state";

/**
 * Encabezado de la lista de invitados: título, buscador y alta.
 *
 * El botón vive acá y no suelto arriba para que quede al lado del buscador,
 * que es donde se lo busca: son las dos cosas que se hacen sobre la lista.
 * El formulario se abre debajo de la fila, no adentro.
 */
export function AddGuestPanel({
  action,
  search,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** El buscador, renderizado en el servidor. */
  search?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Invitados</h2>

        <div className="flex flex-wrap items-center gap-2">
          {search}
          <Button onClick={() => setOpen(true)} disabled={open}>
            <Plus size={16} />
            Agregar invitado
          </Button>
        </div>
      </div>

      {open ? (
        <Card className="w-full p-5">
          <h2 className="mb-4 font-semibold">Agregar invitado</h2>
          <GuestForm
            action={action}
            submitLabel="Agregar"
            resetOnSuccess
            cancel={
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </Button>
            }
          />
        </Card>
      ) : null}
    </>
  );
}
