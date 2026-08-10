import { headers } from "next/headers";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { formatEventDate } from "@/lib/format";
import { InvitationStatus } from "@/lib/generated/prisma/enums";
import { invitationUrl } from "@/lib/invitation-url";
import { qrSvg } from "@/lib/qr";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Una invitación indexada por Google sería una filtración: nombre del invitado
// y del evento quedarían públicos y buscables.
export const metadata: Metadata = {
  title: "Invitación",
  robots: { index: false, follow: false, nocache: true },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <Shell>
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-lg font-semibold">Invitación no disponible</p>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </Shell>
  );
}

export default async function InvitacionPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // El token es lo único que protege esta página, así que hay que encarecer
  // la fuerza bruta. El límite corta ANTES de tocar la base: sin esto, probar
  // tokens al azar sale gratis en consultas.
  const ip = clientIp(await headers());
  const limit = rateLimit(`invitacion:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) {
    // Nota: una página no puede devolver 429; el efecto protector real es que
    // acá no se consulta la base.
    return (
      <Unavailable
        message={`Demasiadas solicitudes. Probá de nuevo en ${limit.retryAfterSeconds} segundos.`}
      />
    );
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      shortCode: true,
      maxPeople: true,
      status: true,
      revokedAt: true,
      guest: { select: { firstName: true, lastName: true } },
      event: {
        select: {
          name: true,
          eventDate: true,
          startTime: true,
          endTime: true,
          location: true,
          status: true,
        },
      },
    },
  });

  // Mismo mensaje para "no existe" y "revocada": distinguirlos le confirmaría
  // a quien prueba tokens cuáles son válidos.
  if (
    !invitation ||
    invitation.revokedAt !== null ||
    invitation.status === InvitationStatus.BLOCKED ||
    invitation.status === InvitationStatus.CANCELLED
  ) {
    return (
      <Unavailable message="Este link no es válido o fue dado de baja. Consultá con quien te invitó." />
    );
  }

  if (invitation.event.status === "CANCELLED") {
    return <Unavailable message="El evento fue cancelado." />;
  }

  const { event, guest } = invitation;
  const svg = await qrSvg(invitationUrl(token));

  return (
    <Shell>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="bg-brand px-6 py-8 text-center text-brand-foreground">
          <p className="text-xs tracking-[0.2em] uppercase opacity-80">
            Invitación
          </p>
          <h1 className="mt-2 text-2xl leading-tight font-bold">{event.name}</h1>
        </div>

        <div className="px-6 py-6 text-center">
          <p className="text-xl font-semibold">
            {guest.firstName} {guest.lastName}
          </p>

          <div className="mt-4 flex flex-col gap-1 text-sm">
            <p>{formatEventDate(event.eventDate)}</p>
            {event.startTime ? (
              <p className="text-muted">
                {event.startTime}
                {event.endTime ? ` a ${event.endTime}` : ""} hs
              </p>
            ) : null}
            {event.location ? (
              <p className="text-muted">{event.location}</p>
            ) : null}
          </div>

          <p className="mt-4 inline-block rounded-full bg-background px-4 py-1.5 text-sm font-medium">
            {invitation.maxPeople}{" "}
            {invitation.maxPeople === 1 ? "persona" : "personas"}
          </p>

          <div
            className="mx-auto mt-6 w-56 [&>svg]:h-auto [&>svg]:w-full"
            // Generado por la librería de QR a partir de nuestra propia URL,
            // no de datos que venga del usuario.
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <p className="mt-2 font-mono text-lg tracking-widest">
            {invitation.shortCode}
          </p>
          <p className="mt-1 text-xs text-muted">
            Si el QR no se lee, dictá este código en el ingreso.
          </p>
        </div>

        <div className="border-t border-border bg-background px-6 py-4 text-center">
          <p className="text-xs text-muted">
            Presentá esta pantalla al llegar. No hace falta instalar ninguna
            aplicación.
          </p>
        </div>
      </div>
    </Shell>
  );
}
