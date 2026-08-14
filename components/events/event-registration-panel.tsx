"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Link2, RefreshCw, Share2 } from "lucide-react";

import { CopyLinkButton } from "@/components/invitations/invitation-tools";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import {
  regenerateRegistrationLinkAction,
  saveRegistrationSettingsAction,
} from "@/lib/actions/event-registration";
import { emptyFormState } from "@/lib/form-state";

export type RegistrationSettings = {
  open: boolean;
  autoApprove: boolean;
  maxPeople: number;
  /** "YYYY-MM-DD" o "" */
  deadline: string;
  url: string | null;
  /** Invitados que ya entraron por el formulario. */
  registered: number;
  /** Cupo del evento, en personas. Null si no se definió. */
  capacity: number | null;
  /** Personas ya comprometidas, del formulario y de la carga manual. */
  authorized: number;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </Button>
  );
}

/**
 * Controles del formulario público.
 *
 * El link es un portador: quien lo tenga puede registrarse. Por eso la tarjeta
 * pone adelante lo que de verdad controla el acceso —cupo, tope por registro,
 * fecha límite y el interruptor de cierre— y no la repartición del link.
 */
export function EventRegistrationPanel({
  eventId,
  settings,
}: {
  eventId: string;
  settings: RegistrationSettings;
}) {
  const hasCapacity = settings.capacity !== null;
  const remaining = hasCapacity
    ? Math.max(0, settings.capacity! - settings.authorized)
    : null;
  const [state, formAction] = useActionState(
    saveRegistrationSettingsAction.bind(null, eventId),
    emptyFormState,
  );

  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const err = state.fieldErrors ?? {};

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Share2 size={16} className="text-muted" />
          Formulario de invitación
        </h2>
        {settings.open ? (
          <Badge tone="ok">Abierto</Badge>
        ) : (
          <Badge tone="neutral">Cerrado</Badge>
        )}
      </div>

      <p className="mt-1 text-sm text-muted">
        Un formulario que el anfitrión reparte a sus invitados para que confirmen su asistencia.
      </p>

      {/* El cupo es lo que cierra el formulario, así que va acá y no solo en
          los datos del evento: mirar esta tarjeta tiene que alcanzar para
          saber cuánto queda. */}
      {hasCapacity ? (
        <div className="mt-4 flex items-end justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
          <div>
            <p className="text-xs text-muted">Cupo del evento</p>
            <p className="text-sm">
              <span className="text-lg font-bold tabular-nums">
                {settings.authorized}
              </span>{" "}
              de {settings.capacity} personas
            </p>
          </div>

          <p
            className={`text-sm font-semibold ${remaining === 0 ? "text-deny" : "text-muted"}`}
          >
            {remaining === 0
              ? "Sin lugares"
              : `Quedan ${remaining} ${remaining === 1 ? "lugar" : "lugares"}`}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-warn-surface px-3 py-2 text-sm text-warn">
          Este evento no tiene cupo definido, así que el formulario no tiene
          techo: se puede anotar cualquier cantidad de gente. Poné el cupo en
          los datos del evento.
        </p>
      )}

      {settings.url ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Link2 size={14} />
            Link para compartir
          </p>
          <p className="font-mono text-xs break-all">{settings.url}</p>

          <div className="flex flex-wrap gap-2">
            <CopyLinkButton url={settings.url} />
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setAsking(true)}
            >
              <RefreshCw size={15} />
              Generar otro
            </Button>
          </div>

          <p className="text-xs text-muted">
            {settings.registered} {settings.registered === 1 ? "persona" : "personas"}{" "}
            se registraron por este formulario.
          </p>
        </div>
      ) : null}

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <FormError message={state.error} />
        {error ? (
          <p role="alert" className="text-sm text-deny">
            {error}
          </p>
        ) : null}

        <Switch
          name="registrationOpen"
          label="Habilitar formulario"
          hint=""
          defaultChecked={
            state.values ? state.values.registrationOpen === "on" : settings.open
          }
        />

        <Switch
          name="registrationAutoApprove"
          label="Entregar entrada QR al invitado"
          hint="Si está apagado, cada invitado queda “sin confirmar” hasta habilitarlo manualmente."
          defaultChecked={
            state.values
              ? state.values.registrationAutoApprove === "on"
              : settings.autoApprove
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Personas permitidas por invitado"
            htmlFor="registrationMaxPeople"
            error={err.registrationMaxPeople}
            hint=""
          >
            <Input
              id="registrationMaxPeople"
              name="registrationMaxPeople"
              type="number"
              min={1}
              max={50}
              defaultValue={
                state.values?.registrationMaxPeople ?? String(settings.maxPeople)
              }
              error={err.registrationMaxPeople}
            />
          </Field>

          <Field
            label="Fecha de cierre de formulario"
            htmlFor="registrationDeadline"
            hint=""
          >
            <Input
              id="registrationDeadline"
              name="registrationDeadline"
              type="date"
              defaultValue={
                state.values?.registrationDeadline ?? settings.deadline
              }
            />
          </Field>
        </div>

        <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted">
          {hasCapacity
            ? "El formulario se cierra automaticamente al llenarse el cupo del evento o al llegar a la fecha límite."
            : "Sin cupo establecido,  el formulario se cierra automaticamente al llegar a la fecha límite."}
        </p>

        <div className="flex items-center gap-2">
          <Submit />
          {state.ok ? (
            <span className="text-sm text-ok">Guardado.</span>
          ) : null}
        </div>
      </form>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        pending={pending}
        variant="danger"
        title="Generar un link nuevo"
        confirmLabel="Generar"
        description="El link actual deja de funcionar en el momento. Quienes ya se registraron conservan su entrada."
        onConfirm={() =>
          startTransition(async () => {
            setError(null);
            const result = await regenerateRegistrationLinkAction(eventId);
            setAsking(false);
            if (result.error) setError(result.error);
          })
        }
      />
    </Card>
  );
}
