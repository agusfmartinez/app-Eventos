import { ImageResponse } from "next/og";

import { prisma } from "@/lib/db";
import { formatEventDate } from "@/lib/format";
import { InvitationStatus } from "@/lib/generated/prisma/enums";
import { invitationUrl } from "@/lib/invitation-url";
import { qrPngDataUrl } from "@/lib/qr";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveLocation } from "@/lib/venue";

/**
 * Imagen de la invitación, para descargar y mandar por WhatsApp.
 *
 * Se renderiza en el servidor con Satori (next/og), que soporta un subconjunto
 * de CSS: solo flexbox, y todo div con más de un hijo necesita display:flex
 * explícito. De ahí que los estilos vayan inline y sean más verbosos de lo
 * habitual.
 *
 * 1080x1350 es formato retrato: entra completa en la vista previa de WhatsApp
 * sin que el usuario tenga que abrirla.
 */

const WIDTH = 1080;
const HEIGHT = 1350;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Generar una imagen cuesta CPU: sin límite, esta ruta es un buen vector
  // para tumbar el servidor.
  const ip = clientIp(request.headers);
  const limit = rateLimit(`imagen:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return new Response("Demasiadas solicitudes.", {
      status: 429,
      headers: { "retry-after": String(limit.retryAfterSeconds) },
    });
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
          space: { select: { address: true } },
        },
      },
    },
  });

  if (
    !invitation ||
    invitation.revokedAt !== null ||
    invitation.status === InvitationStatus.BLOCKED ||
    invitation.status === InvitationStatus.CANCELLED ||
    invitation.event.status === "CANCELLED"
  ) {
    return new Response("Invitación no disponible.", { status: 404 });
  }

  const { event, guest } = invitation;
  const address = resolveLocation(event);
  const qr = await qrPngDataUrl(invitationUrl(token), 460);

  const timeLabel = event.startTime
    ? `${event.startTime}${event.endTime ? ` a ${event.endTime}` : ""} hs`
    : null;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          backgroundColor: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: "#6d28d9",
            color: "#ffffff",
            paddingTop: 56,
            paddingBottom: 56,
          }}
        >
          <div style={{ fontSize: 26, letterSpacing: 10, opacity: 0.85 }}>
            INVITACIÓN
          </div>
          <div
            style={{
              fontSize: 62,
              fontWeight: 700,
              marginTop: 16,
              paddingLeft: 60,
              paddingRight: 60,
              textAlign: "center",
            }}
          >
            {event.name}
          </div>
        </div>

        {/* Invitado */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 48,
          }}
        >
          {/* String único: Satori trata cada interpolación como un hijo
              aparte, y un div con varios hijos necesitaría display:flex. */}
          <div style={{ fontSize: 52, fontWeight: 600, color: "#17171a" }}>
            {`${guest.firstName} ${guest.lastName}`}
          </div>

          <div style={{ fontSize: 32, color: "#6b6b76", marginTop: 20 }}>
            {formatEventDate(event.eventDate)}
          </div>

          {timeLabel ? (
            <div style={{ fontSize: 32, color: "#6b6b76", marginTop: 8 }}>
              {timeLabel}
            </div>
          ) : null}

          {address ? (
            <div style={{ fontSize: 30, color: "#6b6b76", marginTop: 8 }}>
              {address}
            </div>
          ) : null}

          <div
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: "#17171a",
              backgroundColor: "#f1f1f4",
              borderRadius: 999,
              paddingLeft: 28,
              paddingRight: 28,
              paddingTop: 10,
              paddingBottom: 10,
              marginTop: 24,
            }}
          >
            {`${invitation.maxPeople} ${
              invitation.maxPeople === 1 ? "persona" : "personas"
            }`}
          </div>
        </div>

        {/* QR. next/image no sirve acá: esto lo renderiza Satori, no el
            navegador, y solo entiende <img> con un src embebido. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} width={460} height={460} style={{ marginTop: 32 }} alt="" />

        <div
          style={{
            fontSize: 40,
            letterSpacing: 8,
            fontWeight: 700,
            color: "#17171a",
          }}
        >
          {invitation.shortCode}
        </div>

        <div style={{ fontSize: 24, color: "#6b6b76", marginTop: 12 }}>
          Presentá este código en el ingreso
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );

  // ImageResponse renderiza de forma perezosa mientras se envía el stream: si
  // algo falla ahí, el cliente recibe una conexión cortada y el error real se
  // pierde. Materializando el PNG acá, cualquier falla queda atrapada y se
  // puede loguear y responder con un código sensato.
  try {
    const png = await image.arrayBuffer();
    return new Response(png, {
      headers: {
        "content-type": "image/png",
        "content-length": String(png.byteLength),
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Falló la generación de la imagen de invitación", error);
    return new Response("No se pudo generar la imagen.", { status: 500 });
  }
}
