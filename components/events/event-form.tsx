"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CalendarSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { EVENT_STATUS_LABELS } from "@/lib/format";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { EventStatus } from "@/lib/generated/prisma/enums";

export type SpaceOption = {
  id: string;
  name: string;
  capacity: number | null;
};

export type EventFormValues = {
  name: string;
  spaceId: string;
  maxGuests: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  status: EventStatus;
};

const emptyValues: EventFormValues = {
  name: "",
  spaceId: "",
  maxGuests: "",
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
  spaces,
  defaultValues,
  submitLabel = "Guardar",
  cancel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  spaces: SpaceOption[];
  defaultValues?: Partial<EventFormValues>;
  submitLabel?: string;
  cancel?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, emptyFormState);
  const err = state.fieldErrors ?? {};

  /**
   * React 19 resetea el formulario cuando la acción termina, así que si algo
   * falla el usuario perdería todo lo que escribió. La acción devuelve los
   * valores enviados y acá se reponen por encima de los valores por defecto.
   */
  const v = { ...emptyValues, ...defaultValues, ...(state.values ?? {}) };

  const maxGuestsRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const spaceRef = useRef<HTMLSelectElement>(null);

  /**
   * Abre el calendario en la fecha y el espacio que se están cargando.
   *
   * Es el momento en que hace falta: el organizador está con el anfitrión al
   * teléfono y necesita responder qué hay libre sin perder lo que ya escribió.
   * Por eso abre en una pestaña nueva.
   */
  function openAvailability() {
    const params = new URLSearchParams({ vista: "dia" });
    const date = dateRef.current?.value;
    const space = spaceRef.current?.value;
    if (date) params.set("dia", date);
    if (space) params.set("espacio", space);
    window.open(`/panel/calendario?${params.toString()}`, "_blank");
  }

  /**
   * Al elegir un espacio, propone su capacidad como cupo — pero solo si el
   * campo está vacío. Pisar un número que el organizador ya pactó con el
   * anfitrión sería peor que no ayudar.
   */
  function onSpaceChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const input = maxGuestsRef.current;
    if (!input || input.value.trim() !== "") return;

    const capacity = spaces.find((s) => s.id === event.target.value)?.capacity;
    if (capacity) input.value = String(capacity);
  }

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

      <Field
        label="Estado"
        htmlFor="status"
        error={err.status}
        hint="Solo los eventos publicados o en curso aparecen en el control de acceso."
      >
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
            ref={dateRef}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Espacio"
          htmlFor="spaceId"
          error={err.spaceId}
          hint={
            spaces.length > 0
              ? "Sub-salón donde se hace. Se usa para detectar dobles reservas."
              : "Todavía no hay espacios cargados. Se administran en Espacios."
          }
        >
          <Select
            id="spaceId"
            name="spaceId"
            ref={spaceRef}
            defaultValue={v.spaceId}
            error={err.spaceId}
            onChange={onSpaceChange}
            disabled={spaces.length === 0}
          >
            <option value="">Sin asignar</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
                {space.capacity ? ` (hasta ${space.capacity})` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Cupo de invitados"
          htmlFor="maxGuests"
          error={err.maxGuests}
          hint="Personas pactadas con el anfitrión. Solo avisa al superarlo."
        >
          <Input
            id="maxGuests"
            name="maxGuests"
            type="number"
            min={1}
            ref={maxGuestsRef}
            defaultValue={v.maxGuests}
            error={err.maxGuests}
            placeholder="150"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={openAvailability}
        className="flex items-center gap-1.5 self-start text-sm font-medium text-brand hover:underline"
      >
        <CalendarSearch size={15} />
        Ver disponibilidad de esa fecha
      </button>

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
