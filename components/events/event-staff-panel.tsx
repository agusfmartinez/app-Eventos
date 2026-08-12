"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/misc";
import {
  assignStaffAction,
  unassignStaffAction,
} from "@/lib/actions/event-staff";
import { emptyFormState } from "@/lib/form-state";

export type AssignedStaff = {
  userId: string;
  stationLabel: string | null;
  username: string;
  fullName: string;
  active: boolean;
};

export type StaffCandidate = {
  id: string;
  username: string;
  fullName: string;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Asignando…" : "Asignar"}
    </Button>
  );
}

function Unassign({ eventId, userId }: { eventId: string; userId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="dangerGhost"
        size="sm"
        disabled={pending}
        aria-label="Quitar de la puerta"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await unassignStaffAction(eventId, userId);
            if (result.error) setError(result.error);
          })
        }
      >
        <X size={15} />
      </Button>
      {error ? <p className="text-xs text-deny">{error}</p> : null}
    </div>
  );
}

export function EventStaffPanel({
  eventId,
  assigned,
  candidates,
}: {
  eventId: string;
  assigned: AssignedStaff[];
  candidates: StaffCandidate[];
}) {
  const [state, formAction] = useActionState(
    assignStaffAction.bind(null, eventId),
    emptyFormState,
  );

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Recepción</h2>
      <p className="mt-1 text-sm text-muted">
        Quiénes pueden escanear en la puerta de este evento. Los
        administradores y organizadores pueden hacerlo siempre, sin asignación.
      </p>

      {assigned.length > 0 ? (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {assigned.map((person) => (
            <div
              key={person.userId}
              className="flex flex-wrap items-center gap-3 p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {person.fullName}
                  {!person.active ? (
                    <Badge tone="deny">Cuenta desactivada</Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  <span className="font-mono">{person.username}</span>
                  {person.stationLabel ? ` · ${person.stationLabel}` : ""}
                </p>
              </div>
              <Unassign eventId={eventId} userId={person.userId} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Nadie de recepción asignado todavía.
        </p>
      )}

      {candidates.length > 0 ? (
        <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Field label="Agregar a la puerta" htmlFor="userId">
              <Select id="userId" name="userId" defaultValue="">
                <option value="" disabled>
                  Seleccionar recepción
                </option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-40 flex-1">
            <Field
              label="Puesto"
              htmlFor="stationLabel"
              hint=""
            >
              <Input
                id="stationLabel"
                name="stationLabel"
                placeholder=""
              />
            </Field>
          </div>

          <div className="pb-1">
            <Submit />
          </div>

          <div className="w-full">
            <FormError message={state.error} />
          </div>
        </form>
      ) : (
        // Sin candidatos hay dos motivos distintos, y confundirlos manda al
        // admin a crear cuentas que ya tiene. Si el evento ya tiene gente, lo
        // que pasa es que no queda nadie más.
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <UserPlus size={15} />
          {assigned.length > 0
            ? "No queda ninguna cuenta de recepción activa sin asignar."
            : "Todavía no hay cuentas de recepción creadas. Se crean en Usuarios."}
        </p>
      )}
    </Card>
  );
}
