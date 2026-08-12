"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { changeOwnPasswordAction } from "@/lib/actions/password";
import { emptyFormState } from "@/lib/form-state";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Guardando…" : "Guardar contraseña"}
    </Button>
  );
}

export function ChangePasswordForm({ temporary }: { temporary: boolean }) {
  const [state, formAction] = useActionState(
    changeOwnPasswordAction,
    emptyFormState,
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <Field
        label={temporary ? "Contraseña temporal" : "Contraseña actual"}
        htmlFor="currentPassword"
        required
        error={err.currentPassword}
        hint={
          temporary ? "La que te pasó el administrador." : undefined
        }
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          autoFocus
          error={err.currentPassword}
        />
      </Field>

      <Field
        label="Nueva contraseña"
        htmlFor="newPassword"
        required
        error={err.newPassword}
        hint="Mínimo 8 caracteres."
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          error={err.newPassword}
        />
      </Field>

      <Field
        label="Repetir la nueva contraseña"
        htmlFor="repeatPassword"
        required
        error={err.repeatPassword}
      >
        <Input
          id="repeatPassword"
          name="repeatPassword"
          type="password"
          autoComplete="new-password"
          error={err.repeatPassword}
        />
      </Field>

      <Submit />
    </form>
  );
}
