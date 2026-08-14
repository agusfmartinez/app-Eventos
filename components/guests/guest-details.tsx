"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { GuestForm, type GuestFormValues } from "@/components/guests/guest-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/misc";
import type { FormState } from "@/lib/form-state";
import { formatPhone } from "@/lib/format";
import { InvitationStatus } from "@/lib/generated/prisma/enums";

const STATUS_LABELS: Record<InvitationStatus, string> = {
  PENDING: "Pendiente de confirmar",
  ENABLED: "Habilitado",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
};

/**
 * Ficha del invitado: primero se lee, después se edita.
 *
 * Abrir directo en el formulario invitaba a pisar un dato sin querer —basta
 * un scroll sobre el campo numérico— y encima el caso frecuente es venir a
 * mirar, no a corregir. Editar ahora es una decisión explícita.
 */
export function GuestDetails({
  action,
  values,
  viaRegistration,
  hasInvitation,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values: GuestFormValues;
  viaRegistration: boolean;
  /** Sin invitación no hay cupo ni estado que mostrar. */
  hasInvitation: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  if (editing) {
    return (
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Editar invitado</h2>
        <GuestForm
          action={action}
          submitLabel="Guardar cambios"
          defaultValues={values}
          onSuccess={() => {
            setEditing(false);
            setSaved(true);
          }}
          cancel={
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Datos del invitado</h2>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil size={15} />
          Editar
        </Button>
      </div>

      {saved ? (
        <p className="mt-3 rounded-lg bg-ok-surface px-3 py-2 text-sm text-ok">
          Cambios guardados.
        </p>
      ) : null}

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Row label="Nombre" value={`${values.firstName} ${values.lastName}`} />
        <Row label="DNI" value={values.document || null} />
        <Row
          label="Teléfono"
          value={values.phone ? formatPhone(values.phone) : null}
        />

        {hasInvitation ? (
          <>
            <Row
              label="Personas permitidas"
              value={String(values.maxPeople)}
            />
            <div>
              <dt className="text-xs text-muted">Estado</dt>
              <dd className="mt-0.5">
                <Badge
                  tone={
                    values.status === "ENABLED"
                      ? "ok"
                      : values.status === "PENDING"
                        ? "warn"
                        : "deny"
                  }
                >
                  {STATUS_LABELS[values.status]}
                </Badge>
              </dd>
            </div>
          </>
        ) : null}

        <Row
          label="Origen"
          value={viaRegistration ? "Formulario de invitación" : "Cargado por el organizador"}
        />
      </dl>

      {values.notes ? (
        <div className="mt-4 rounded-lg bg-warn-surface px-3 py-2">
          <p className="text-xs text-warn/90">Observaciones</p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap text-warn">
            {values.notes}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? <span className="text-muted">—</span>}</dd>
    </div>
  );
}
