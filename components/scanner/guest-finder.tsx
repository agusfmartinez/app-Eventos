"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";

import { formatPhone } from "@/lib/format";
import { InvitationStatus } from "@/lib/generated/prisma/enums";

export type FinderGuest = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  invitation: {
    status: InvitationStatus;
    maxPeople: number;
    enteredCount: number;
  } | null;
};

/**
 * Buscador de invitados de la puerta.
 *
 * Filtra en el cliente sobre la lista ya cargada, sin ir al servidor: el
 * evento tiene una cantidad acotada de invitados, así que traerlos una vez
 * cuesta menos que una consulta por búsqueda. A cambio el filtrado es
 * instantáneo mientras se tipea y sigue funcionando si el wifi del salón se
 * cae a mitad de la noche, que es justo cuando hace falta.
 *
 * El panel usa el otro enfoque —búsqueda en la URL contra la base— porque ahí
 * cada fila trae acciones y la lista puede crecer sin techo.
 */
export function GuestFinder({ guests }: { guests: FinderGuest[] }) {
  const [query, setQuery] = useState("");

  // Se normaliza una sola vez por invitado y no en cada tecla: el buscador
  // corre en el teléfono del operador, no en una notebook.
  const indexed = useMemo(
    () =>
      guests.map((guest) => ({
        guest,
        haystack: normalize(`${guest.firstName} ${guest.lastName}`),
        phone: (guest.phone ?? "").replace(/\D/g, ""),
      })),
    [guests],
  );

  const needle = normalize(query);
  const digits = query.replace(/\D/g, "");

  const found = needle
    ? indexed.filter(
        (row) =>
          row.haystack.includes(needle) ||
          (digits.length >= 3 && row.phone.includes(digits)),
      )
    : indexed;

  return (
    <>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar invitados"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-surface py-3 pr-16 pl-9 text-base outline-none focus:border-brand"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-muted"
          >
            Limpiar
          </button>
        ) : null}
      </div>

      {found.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
          <Users size={26} className="text-muted" />
          <p className="text-sm font-medium">
            {guests.length === 0
              ? "Todavía no hay invitados"
              : "Nadie coincide con la búsqueda"}
          </p>
          {guests.length > 0 ? (
            <p className="text-xs text-muted">
              Probá con el apellido, o pedile el QR a la persona.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {needle ? (
            <p className="text-xs text-muted">
              {found.length} de {guests.length}
            </p>
          ) : null}

          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {found.map(({ guest }) => (
              <li
                key={guest.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {guest.lastName}, {guest.firstName}
                  </p>
                  <p className="text-xs text-muted">{formatPhone(guest.phone)}</p>
                </div>
                <GuestState invitation={guest.invitation} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Sin acentos ni mayúsculas: nadie escribe "Gómez" con tilde en la puerta. */
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Estado del invitado en una etiqueta. Es lo que el operador mira en la puerta,
 * así que dice cuántos entraron de cuántos y no solo si entró o no.
 */
function GuestState({ invitation }: { invitation: FinderGuest["invitation"] }) {
  if (!invitation) return <Tag tone="neutral">Sin invitación</Tag>;

  if (
    invitation.status === InvitationStatus.BLOCKED ||
    invitation.status === InvitationStatus.CANCELLED
  ) {
    return <Tag tone="deny">Bloqueada</Tag>;
  }

  if (invitation.status === InvitationStatus.PENDING) {
    return <Tag tone="warn">Sin confirmar</Tag>;
  }

  if (invitation.enteredCount === 0) {
    return <Tag tone="neutral">No llegó · {invitation.maxPeople}</Tag>;
  }

  const complete = invitation.enteredCount >= invitation.maxPeople;

  return (
    <Tag tone={complete ? "ok" : "warn"}>
      {invitation.enteredCount} de {invitation.maxPeople}
    </Tag>
  );
}

const tagTones = {
  neutral: "bg-background text-muted",
  ok: "bg-ok-surface text-ok",
  warn: "bg-warn-surface text-warn",
  deny: "bg-deny-surface text-deny",
} as const;

function Tag({
  tone,
  children,
}: {
  tone: keyof typeof tagTones;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${tagTones[tone]}`}
    >
      {children}
    </span>
  );
}
