"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import type { CheckInResult } from "@/lib/checkin";

/**
 * El sello que ve el operador de puerta.
 *
 * Requisito 16 del brief: verde pasa, rojo no pasa, amarillo requiere
 * atención. Se lee de un vistazo, a un metro de distancia, por alguien que no
 * es técnico. Nada de sutilezas: color pleno, ícono grande, una frase.
 */

type Tone = "ok" | "warn" | "deny";

/**
 * Colores fijos, iguales en tema claro y oscuro (ver `app/globals.css`).
 *
 * El sello es un panel a sangre, así que no compite con el fondo de la página
 * y no necesita adaptarse. Y el operador tiene que ver siempre el mismo verde
 * y el mismo rojo: que la señal de "pasa" cambie de tono según cómo esté
 * configurado cada teléfono es justo lo que hay que evitar en la puerta.
 */
const toneStyles: Record<Tone, string> = {
  ok: "bg-ok-strong text-white",
  warn: "bg-warn-strong text-white",
  deny: "bg-deny-strong text-white",
};

export function stampToneFor(result: CheckInResult): Tone {
  switch (result.result) {
    case "OK":
      return "ok";
    case "ALLOWED":
      // Si ya entró parte del grupo, es amarillo: el operador tiene que mirar
      // cuántos quedan antes de dejar pasar.
      return result.enteredCount > 0 ? "warn" : "ok";
    case "PENDING":
      return "warn";
    default:
      return "deny";
  }
}

function Icon({ tone }: { tone: Tone }) {
  const size = 64;
  if (tone === "ok") return <CheckCircle2 size={size} />;
  if (tone === "warn") return <AlertTriangle size={size} />;
  return <XCircle size={size} />;
}

function headline(result: CheckInResult): string {
  switch (result.result) {
    case "OK":
      return "INGRESO REGISTRADO";
    case "ALLOWED":
      return result.enteredCount > 0 ? "ACCESO PARCIAL" : "ACCESO AUTORIZADO";
    case "NOT_FOUND":
      return "QR INVÁLIDO";
    case "BLOCKED":
      return "ACCESO DENEGADO";
    case "PENDING":
      return "INVITACIÓN SIN CONFIRMAR";
    case "WRONG_EVENT":
      return "INVITACIÓN DE OTRO EVENTO";
    case "EXHAUSTED":
      return "ACCESO DENEGADO";
    case "TOO_MANY":
      return "SUPERA LO PERMITIDO";
  }
}

export function ResultStamp({
  result,
  eventName,
  spaceName,
  children,
}: {
  result: CheckInResult;
  /** Evento que resolvió el QR. Null cuando el token no existe. */
  eventName: string | null;
  /** Sub-salón del evento: a dónde hay que mandar al invitado. */
  spaceName: string | null;
  children?: React.ReactNode;
}) {
  const tone = stampToneFor(result);

  return (
    <div
      className={`flex flex-col items-center rounded-2xl px-5 py-8 text-center ${toneStyles[tone]}`}
    >
      {result.result === "NOT_FOUND" ? (
        <HelpCircle size={64} />
      ) : (
        <Icon tone={tone} />
      )}

      <p className="mt-3 text-2xl leading-tight font-extrabold tracking-tight">
        {headline(result)}
      </p>

      {"guestName" in result && result.guestName ? (
        <p className="mt-3 text-xl font-semibold">{result.guestName}</p>
      ) : null}

      {/* El evento lo resuelve el QR, así que hay que decir cuál salió: el
          operador no lo eligió y puede haber dos fiestas la misma noche. */}
      {eventName && result.result !== "WRONG_EVENT" ? (
        <p className="mt-1 text-sm opacity-90">Evento: {eventName}</p>
      ) : null}

      {/* A dónde mandarlo. Solo cuando pasa: al que no entra no le sirve saber
          el salón, y en un rechazo lo único que tiene que resaltar es el
          rechazo. Va en caja aparte porque es la frase que el operador dice en
          voz alta con la persona enfrente. */}
      {spaceName && (result.result === "OK" || result.result === "ALLOWED") ? (
        <p className="mt-3 rounded-xl bg-white/20 px-4 py-2 text-lg font-bold">
          {spaceName}
        </p>
      ) : null}

      <div className="mt-2 text-base opacity-95">
        {result.result === "OK" ? (
          <>
            <p className="text-lg font-bold">
              Ingresaron {result.peopleEntered}{" "}
              {result.peopleEntered === 1 ? "persona" : "personas"}
            </p>
            <p className="mt-1">
              Total: {result.enteredCount} de {result.maxPeople}
            </p>
          </>
        ) : null}

        {result.result === "ALLOWED" ? (
          <>
            <p>
              Permitidas: {result.maxPeople} · Ya ingresaron:{" "}
              {result.enteredCount}
            </p>
            <p className="mt-1 text-lg font-bold">
              Disponibles: {result.available}
            </p>
          </>
        ) : null}

        {result.result === "NOT_FOUND" ? (
          <p>No encontramos una invitación asociada.</p>
        ) : null}

        {result.result === "BLOCKED" ? (
          <p>Esta invitación está bloqueada.</p>
        ) : null}

        {result.result === "PENDING" ? (
          <p>
            Todavía no fue confirmada. Consultá con el organizador antes de
            dejar pasar.
          </p>
        ) : null}

        {result.result === "WRONG_EVENT" ? (
          <>
            <p>Pertenece a:</p>
            <p className="font-bold">{result.eventName}</p>
            <p className="mt-2">
              Ese evento no está entre los que podés atender ahora.
            </p>
          </>
        ) : null}

        {result.result === "EXHAUSTED" ? (
          <p>
            Ya ingresaron las {result.maxPeople}{" "}
            {result.maxPeople === 1 ? "persona permitida" : "personas permitidas"}
            .
          </p>
        ) : null}

        {result.result === "TOO_MANY" ? (
          <p>Solo quedan {result.available} lugares disponibles.</p>
        ) : null}
      </div>

      {children ? <div className="mt-6 w-full">{children}</div> : null}
    </div>
  );
}
