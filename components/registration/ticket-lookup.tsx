"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Ticket } from "lucide-react";

import { Field, FormError, Input } from "@/components/ui/field";
import {
  findTicketAction,
  type TicketLookupState,
} from "@/lib/actions/registration";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-brand-foreground disabled:opacity-60"
    >
      {pending ? "Buscando…" : "Buscar mi entrada"}
    </button>
  );
}

export function TicketLookup() {
  const [state, formAction] = useActionState<TicketLookupState, FormData>(
    findTicketAction,
    {},
  );

  const sent = state.values ?? {};
  const err = state.fieldErrors ?? {};

  if (state.ok && state.ticket) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg font-semibold">Encontramos tu entrada</p>
        {state.eventName ? (
          <p className="text-sm text-muted">{state.eventName}</p>
        ) : null}

        <Link
          href={`/i/${state.ticket}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-brand-foreground"
        >
          <Ticket size={18} />
          Ver mi entrada
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <Field label="DNI" htmlFor="document" required error={err.document}>
        <Input
          id="document"
          name="document"
          defaultValue={sent.document ?? ""}
          error={err.document}
          inputMode="numeric"
          autoComplete="off"
          placeholder=""
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

      <Submit />
    </form>
  );
}
