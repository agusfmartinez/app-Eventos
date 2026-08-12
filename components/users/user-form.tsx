"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import type { CredentialsState } from "@/lib/actions/users";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/format";
import { Role } from "@/lib/generated/prisma/enums";
import { buildUsername } from "@/lib/username";

export type UserFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
};

const emptyValues: UserFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  role: Role.DOOR,
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function UserForm({
  action,
  defaultValues,
  submitLabel = "Guardar",
  cancel,
  /** Cuenta propia: no puede cambiarse el rol a sí mismo. */
  isSelf = false,
  /**
   * Edición: el username ya existe y no se recalcula. Se muestra el real, no
   * el que saldría del nombre nuevo, porque es el que sigue usando para
   * entrar.
   */
  lockedUsername,
  /**
   * Se llama cuando la acción termina bien. El padre decide qué sigue: cerrar
   * el formulario y volver al listado, y mostrar las credenciales si el alta
   * las generó.
   */
  onSuccess,
}: {
  action: (
    prev: CredentialsState,
    formData: FormData,
  ) => Promise<CredentialsState>;
  defaultValues?: Partial<UserFormValues>;
  submitLabel?: string;
  cancel?: React.ReactNode;
  isSelf?: boolean;
  lockedUsername?: string;
  onSuccess?: (state: CredentialsState) => void;
}) {
  const [state, formAction] = useActionState<CredentialsState, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  const sent = state.values;
  const v = {
    ...emptyValues,
    ...defaultValues,
    ...(sent
      ? {
          firstName: sent.firstName ?? "",
          lastName: sent.lastName ?? "",
          email: sent.email ?? "",
          role: (sent.role as Role) ?? Role.DOOR,
        }
      : {}),
  };

  // El rol y el nombre se siguen con estado para que la descripción de
  // permisos y el usuario propuesto se actualicen a medida que se escribe.
  // Sin esto mostraban el valor inicial y no lo que el admin está eligiendo.
  const [role, setRole] = useState<Role>(v.role);
  const [firstName, setFirstName] = useState(v.firstName);
  const [lastName, setLastName] = useState(v.lastName);

  const previewUsername =
    lockedUsername ??
    (firstName.trim() && lastName.trim()
      ? buildUsername(firstName, lastName)
      : null);

  // El estado es un objeto nuevo por cada envío, así que el efecto corre una
  // vez por acción exitosa y no en cada re-render.
  useEffect(() => {
    if (state.ok) onSuccess?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="firstName" required error={err.firstName}>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={v.firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={err.firstName}
            autoComplete="off"
          />
        </Field>

        <Field label="Apellido" htmlFor="lastName" required error={err.lastName}>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={v.lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={err.lastName}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Usuario"
          htmlFor="usernamePreview"
        >
          {/* Deshabilitado, y por eso tampoco se envía: el username lo resuelve
              el servidor, que además es el único que puede saber si ya está
              tomado y necesita un número al final. */}
          <Input
            id="usernamePreview"
            value={previewUsername ?? ""}
            placeholder=""
            readOnly
            disabled
            className="font-mono"
          />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          error={err.email}
        >
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={v.email}
            error={err.email}
            autoComplete="off"
          />
        </Field>
        <Field
          label="Rol"
          htmlFor="role"
          error={err.role}
          hint={ROLE_DESCRIPTIONS[role]}
        >
          <Select
            id="role"
            name="role"
            defaultValue={v.role}
            onChange={(e) => setRole(e.target.value as Role)}
            error={err.role}
            disabled={isSelf}
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {isSelf ? (
          <>
            {/* Un select deshabilitado no se envía: sin esto el rol llegaría
                vacío y la acción creería que el admin se está degradando. */}
            <input type="hidden" name="role" value={v.role} />
          </>
        ) : null}
        <div className="flex items-end justify-end gap-2">
          <Submit label={submitLabel} />
          {cancel}
        </div>
      </div>


    </form>
  );
}
