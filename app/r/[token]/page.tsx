import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Clock, MapPin } from "lucide-react";

import { RegistrationForm } from "@/components/registration/registration-form";
import { formatEventDate } from "@/lib/format";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getRegistrationForm,
  type RegistrationClosedReason,
} from "@/lib/registration";

export const dynamic = "force-dynamic";

// El formulario expone el nombre del evento y su fecha: indexado sería una
// filtración, y además un link de registro no debería llegarle a nadie por
// una búsqueda.
export const metadata: Metadata = {
  title: "Confirmar asistencia",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Formulario público de registro.
 *
 * Igual que la invitación, va siempre en tema claro: lo abre gente desde su
 * teléfono, sin sesión, y conviene que se vea igual en todos lados.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-theme="light"
      className="flex flex-1 items-center justify-center bg-background p-4 text-foreground"
    >
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

const CLOSED_COPY: Record<RegistrationClosedReason, { title: string; detail: string }> = {
  NOT_FOUND: {
    title: "Link no válido",
    detail: "Este link de registro no existe o fue dado de baja.",
  },
  CLOSED: {
    title: "Registro cerrado",
    detail: "El formulario de registro ha finalizado. Por ahora no se puede confirmar asistencia. Consultá con el organizador.",
  },
  EXPIRED: {
    title: "Se venció el plazo",
    detail: "La fecha para registrarse ya pasó. Consultá con quien te invitó.",
  },
  FULL: {
    title: "No quedan lugares",
    detail: "El cupo del evento ya está completo.",
  },
};

export default async function RegistroPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Mismo criterio que la invitación: el límite corta antes de tocar la base,
  // así probar tokens al azar no sale gratis en consultas.
  const ip = clientIp(await headers());
  const limit = rateLimit(`registro:${ip}`, { limit: 30, windowMs: 60_000 });

  if (!limit.ok) {
    return (
      <Shell>
        <Closed
          title="Demasiadas solicitudes"
          detail={`Probá de nuevo en ${limit.retryAfterSeconds} segundos.`}
        />
      </Shell>
    );
  }

  const state = await getRegistrationForm(token);

  if (!state.open) {
    const copy = CLOSED_COPY[state.reason];
    return (
      <Shell>
        <Closed title={copy.title} detail={copy.detail} />
      </Shell>
    );
  }

  const { form } = state;

  return (
    <Shell>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="bg-brand px-6 py-7 text-brand-foreground">
          <p className="text-xs tracking-[0.2em] uppercase opacity-80">
            Confirmá tu asistencia
          </p>
          <h1 className="mt-2 text-2xl leading-tight font-bold">
            {form.eventName}
          </h1>

          <div className="mt-4 flex flex-col gap-1.5 text-sm opacity-95">
            <p className="flex items-center gap-2">
              <CalendarDays size={15} className="shrink-0" />
              {formatEventDate(form.eventDate)}
            </p>
            {form.startTime ? (
              <p className="flex items-center gap-2">
                <Clock size={15} className="shrink-0" />
                {`${form.startTime}${form.endTime ? ` a ${form.endTime}` : ""} hs`}
              </p>
            ) : null}
            {form.location || form.spaceName ? (
              <p className="flex items-center gap-2">
                <MapPin size={15} className="shrink-0" />
                {[form.location, form.spaceName].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>

        {form.notes ? (
          <p className="border-b border-border bg-background px-6 py-4 text-sm whitespace-pre-wrap">
            {form.notes}
          </p>
        ) : null}

        <div className="px-6 py-6">
          <RegistrationForm
            registrationToken={token}
            maxPeople={form.maxPeoplePerGuest}
            autoApprove={form.autoApprove}
          />
        </div>
      </div>
    </Shell>
  );
}

function Closed({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
      <p className="mt-4 text-xs text-muted">
        ¿Ya te habías registrado?{" "}
        <Link href="/mi-entrada" className="underline">
          Buscá tu entrada
        </Link>
        .
      </p>
    </div>
  );
}
