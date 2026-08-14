"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { InvitationStatus } from "@/lib/generated/prisma/enums";

export type GuestFormValues = {
  firstName: string;
  lastName: string;
  document: string;
  phone: string;
  notes: string;
  maxPeople: number;
  status: InvitationStatus;
};

const emptyValues: GuestFormValues = {
  firstName: "",
  lastName: "",
  document: "",
  phone: "",
  notes: "",
  maxPeople: 1,
  status: InvitationStatus.ENABLED,
};

// PENDING está para invitados sin confirmar; CANCELLED se maneja eliminando o
// bloqueando, así que no se ofrece acá.
const STATUS_LABELS: Partial<Record<InvitationStatus, string>> = {
  PENDING: "Pendiente de confirmar",
  ENABLED: "Habilitado",
  BLOCKED: "Bloqueado",
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function GuestForm({
  action,
  defaultValues,
  submitLabel = "Guardar",
  cancel,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Partial<GuestFormValues>;
  submitLabel?: string;
  cancel?: React.ReactNode;
  resetOnSuccess?: boolean;
  /** Se llama cuando la acción termina bien. El padre decide qué sigue. */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, emptyFormState);
  const err = state.fieldErrors ?? {};

  // El estado es un objeto nuevo por envío, así que esto corre una vez por
  // guardado exitoso y no en cada render.
  useEffect(() => {
    if (state.ok) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // React 19 resetea el formulario al terminar la acción: sin reponer lo
  // enviado, un error de validación borraría toda la carga del invitado.
  const v = { ...emptyValues, ...defaultValues, ...(state.values ?? {}) };

  // Al cargar invitados en tanda, el formulario tiene que quedar vacío y listo
  // para el siguiente. La key fuerza a React a remontarlo con los defaults.
  const formKey = resetOnSuccess && state.ok ? "reset" : "form";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          htmlFor="firstName"
          required
          error={err.firstName}
        >
          <Input
            id="firstName"
            name="firstName"
            defaultValue={v.firstName}
            error={err.firstName}
            autoFocus
          />
        </Field>

        <Field label="Apellido" htmlFor="lastName" required error={err.lastName}>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={v.lastName}
            error={err.lastName}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="DNI"
          htmlFor="document"
          error={err.document}
          hint="Opcional acá. Quien se registra por el formulario público sí lo carga."
        >
          <Input
            id="document"
            name="document"
            inputMode="numeric"
            defaultValue={v.document}
            error={err.document}
          />
        </Field>

        <Field
          label="Teléfono"
          htmlFor="phone"
          error={err.phone}
          hint="Se guarda solo con números."
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={v.phone}
            error={err.phone}
            placeholder=""
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Personas permitidas"
          htmlFor="maxPeople"
          required
          error={err.maxPeople}
          hint="Cuántas personas pueden entrar con esta invitación."
        >
          <Input
            id="maxPeople"
            name="maxPeople"
            type="number"
            min={1}
            max={50}
            defaultValue={v.maxPeople}
            error={err.maxPeople}
          />
        </Field>

        <Field label="Estado" htmlFor="status" error={err.status}>
          <Select
            id="status"
            name="status"
            defaultValue={v.status}
            error={err.status}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Observaciones" htmlFor="notes" error={err.notes}>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={v.notes}
          error={err.notes}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Submit label={submitLabel} />
        {cancel}
        {state.ok && resetOnSuccess ? (
          <span className="text-sm text-ok">Invitado agregado.</span>
        ) : null}
      </div>
    </form>
  );
}
