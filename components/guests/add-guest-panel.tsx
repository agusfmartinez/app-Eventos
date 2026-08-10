"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { GuestForm } from "@/components/guests/guest-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import type { FormState } from "@/lib/form-state";

export function AddGuestPanel({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} />
        Agregar invitado
      </Button>
    );
  }

  return (
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
  );
}
