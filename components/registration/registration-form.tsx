"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Minus, Plus, Ticket } from "lucide-react";

import { Field, FormError, Input } from "@/components/ui/field";
import { registerAction, type RegistrationState } from "@/lib/actions/registration";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-brand-foreground disabled:opacity-60"
    >
      {pending ? "Registrando…" : "Confirmar mi asistencia"}
    </button>
  );
}

export function RegistrationForm({
  registrationToken,
  maxPeople,
  autoApprove,
}: {
  registrationToken: string;
  /** Tope de personas por registro, ya recortado por lo que queda de cupo. */
  maxPeople: number;
  autoApprove: boolean;
}) {
  const [state, formAction] = useActionState<RegistrationState, FormData>(
    registerAction.bind(null, registrationToken),
    {},
  );

  const sent = state.values ?? {};
  const [people, setPeople] = useState(1);
  const err = state.fieldErrors ?? {};

  if (state.ok && state.ticket) {
    return <Registered ticket={state.ticket} pending={state.pending} existing={state.existing} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="firstName" required error={err.firstName}>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={sent.firstName ?? ""}
            error={err.firstName}
            autoComplete="given-name"
          />
        </Field>

        <Field label="Apellido" htmlFor="lastName" required error={err.lastName}>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={sent.lastName ?? ""}
            error={err.lastName}
            autoComplete="family-name"
          />
        </Field>
      </div>

      <Field
        label="DNI"
        htmlFor="document"
        required
        error={err.document}
        hint="Solo los números, sin puntos."
      >
        <Input
          id="document"
          name="document"
          defaultValue={sent.document ?? ""}
          error={err.document}
          inputMode="numeric"
          autoComplete="off"
        />
      </Field>

      <Field
        label="Teléfono"
        htmlFor="phone"
        error={err.phone}
        hint=""
      >
        <Input
          id="phone"
          name="phone"
          defaultValue={sent.phone ?? ""}
          error={err.phone}
          inputMode="tel"
          autoComplete="tel"
        />
      </Field>

      <Field
        label="¿Cuántas personas ingresan?"
        htmlFor="people"
        error={err.people}
        hint=""
      >
        {/* Botones grandes en vez de un input numérico: esto se llena desde el
            teléfono, y el teclado numérico tapa media pantalla. */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Menos personas"
            onClick={() => setPeople((n) => Math.max(1, n - 1))}
            disabled={people <= 1}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border disabled:opacity-40"
          >
            <Minus size={20} />
          </button>

          <span className="min-w-10 text-center text-2xl font-bold tabular-nums">
            {people}
          </span>

          <button
            type="button"
            aria-label="Más personas"
            onClick={() => setPeople((n) => Math.min(maxPeople, n + 1))}
            disabled={people >= maxPeople}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border disabled:opacity-40"
          >
            <Plus size={20} />
          </button>

          <input type="hidden" name="people" value={people} />
        </div>
      </Field>

      <Submit />

      <p className="text-center text-xs text-muted">
        {autoApprove
          ? "Al confirmar se genera tu entrada con el código QR."
          : "Tu registro queda pendiente de aprobación. Guardá el link para ver tu entrada."}
      </p>
    </form>
  );
}

function Registered({
  ticket,
  pending,
  existing,
}: {
  ticket: string;
  pending?: boolean;
  existing?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <CheckCircle2 size={48} className="text-ok" />

      <div>
        <p className="text-lg font-semibold">
          {existing ? "Ya estabas registrado" : "¡Listo, quedaste registrado!"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {pending
            ? "Tu entrada queda pendiente de aprobación. Guardá el link para ver tu entrada."
            : "Guardá tu entrada para poder acceder el día del evento."}
        </p>
      </div>

      <Link
        href={`/i/${ticket}`}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-brand-foreground"
      >
        <Ticket size={18} />
        Ver mi entrada
      </Link>

      <p className="text-xs text-muted">
        Podrás consultar tu entrada haciendo click{" "}
        <Link href="/mi-entrada" className="underline">
          aquí.
        </Link>
        .
      </p>
    </div>
  );
}
