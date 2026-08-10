"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { EVENT_STATUS_LABELS } from "@/lib/format";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { EventStatus } from "@/lib/generated/prisma/enums";

export type EventFormValues = {
  name: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  status: EventStatus;
};

const emptyValues: EventFormValues = {
  name: "",
  eventDate: "",
  startTime: "",
  endTime: "",
  location: "",
  notes: "",
  status: EventStatus.DRAFT,
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function EventForm({
  action,
  defaultValues,
  submitLabel = "Guardar",
  cancel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Partial<EventFormValues>;
  submitLabel?: string;
  cancel?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, emptyFormState);
  const v = { ...emptyValues, ...defaultValues };
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <Field label="Nombre del evento" htmlFor="name" required error={err.name}>
        <Input
          id="name"
          name="name"
          defaultValue={v.name}
          error={err.name}
          placeholder="Casamiento Juan & María"
          autoFocus
        />
      </Field>

      <Field label="Estado" htmlFor="status" error={err.status}>
        <Select
          id="status"
          name="status"
          defaultValue={v.status}
          error={err.status}
        >
          {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Fecha"
          htmlFor="eventDate"
          required
          error={err.eventDate}
        >
          <Input
            id="eventDate"
            name="eventDate"
            type="date"
            defaultValue={v.eventDate}
            error={err.eventDate}
          />
        </Field>

        <Field label="Hora de inicio" htmlFor="startTime" error={err.startTime}>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue={v.startTime}
            error={err.startTime}
          />
        </Field>

        <Field
          label="Hora de fin"
          htmlFor="endTime"
          error={err.endTime}
          hint="Puede ser de madrugada."
        >
          <Input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue={v.endTime}
            error={err.endTime}
          />
        </Field>
      </div>

      <Field label="Ubicación" htmlFor="location" error={err.location}>
        <Input
          id="location"
          name="location"
          defaultValue={v.location}
          error={err.location}
          placeholder="Salón principal"
        />
      </Field>

      <Field
        label="Información adicional"
        htmlFor="notes"
        error={err.notes}
        hint="Notas internas para el personal del salón."
      >
        <Textarea
          id="notes"
          name="notes"
          defaultValue={v.notes}
          error={err.notes}
        />
      </Field>

      <div className="flex gap-2">
        <Submit label={submitLabel} />
        {cancel}
      </div>
    </form>
  );
}
