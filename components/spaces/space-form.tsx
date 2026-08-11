"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { emptyFormState, type FormState } from "@/lib/form-state";

export type SpaceFormValues = {
  name: string;
  capacity: string;
  notes: string;
  active: boolean;
};

const emptyValues: SpaceFormValues = {
  name: "",
  capacity: "",
  notes: "",
  active: true,
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function SpaceForm({
  action,
  defaultValues,
  submitLabel = "Guardar",
  cancel,
  resetOnSuccess = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Partial<SpaceFormValues>;
  submitLabel?: string;
  cancel?: React.ReactNode;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, emptyFormState);
  const err = state.fieldErrors ?? {};

  // React 19 resetea el formulario al terminar la acción; se repone lo enviado.
  const sent = state.values;
  const v = {
    ...emptyValues,
    ...defaultValues,
    ...(sent
      ? {
          name: sent.name ?? "",
          capacity: sent.capacity ?? "",
          notes: sent.notes ?? "",
          // Un checkbox desmarcado no viaja en el FormData: si hubo envío, su
          // ausencia significa "desmarcado", no "usar el valor por defecto".
          active: sent.active === "on",
        }
      : {}),
  };

  const formKey = resetOnSuccess && state.ok ? "reset" : "form";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="name" required error={err.name}>
          <Input
            id="name"
            name="name"
            defaultValue={v.name}
            error={err.name}
            placeholder="Salón principal"
          />
        </Field>

        <Field
          label="Capacidad"
          htmlFor="capacity"
          error={err.capacity}
          hint="Cuántas personas entran. Propone el cupo de los eventos."
        >
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            defaultValue={v.capacity}
            error={err.capacity}
            placeholder="150"
          />
        </Field>
      </div>

      <Field label="Notas" htmlFor="notes" error={err.notes}>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={v.notes}
          error={err.notes}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={v.active}
          className="size-4"
        />
        Disponible para asignar a eventos nuevos
      </label>

      <div className="flex items-center gap-2">
        <Submit label={submitLabel} />
        {cancel}
        {state.ok && resetOnSuccess ? (
          <span className="text-sm text-ok">Espacio creado.</span>
        ) : null}
      </div>
    </form>
  );
}
