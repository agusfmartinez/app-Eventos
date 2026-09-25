/**
 * Crea un evento de demo presentable (fecha de hoy, estado PUBLICADO) con
 * invitados en distintos estados, para las capturas de la presentación al
 * cliente. Usa las mismas funciones que la app (confirmCheckIn, generadores
 * de token) en vez de escribir la base a mano, para que el estado quede
 * exactamente como lo dejaría un uso real.
 *
 *   npx tsx --conditions=react-server test/seed-demo-event.ts
 *
 * No es idempotente a propósito: cada corrida crea un evento nuevo. Borrar
 * los anteriores a mano desde el panel si se acumulan.
 */
import "dotenv/config";

import { confirmCheckIn } from "../lib/checkin";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { currentVenueDay, dateOfDayNumber, dayNumberOfInterval } from "../lib/schedule";
import { generateInvitationToken, generateShortCode } from "../lib/tokens";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * "Hoy" en términos de la jornada del salón (ver lib/schedule.ts), no la fecha
 * UTC del proceso. Si se usa Date.UTC directo, un desfasaje horario entre el
 * huso del servidor y America/Argentina/Buenos_Aires puede dejar el evento
 * fuera de la ventana que listScannableEvents() considera "ahora", y el
 * scanner queda vacío aunque el evento exista.
 */
function venueToday(): Date {
  return dateOfDayNumber(dayNumberOfInterval(currentVenueDay()));
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No hay ningún usuario ADMIN en la base.");

  const space = await prisma.space.findFirst({ where: { name: "sala 3" } });
  if (!space) throw new Error('No existe el espacio "sala 3".');

  const event = await prisma.event.create({
    data: {
      name: "Boda Ferrari - Guzmán",
      eventDate: venueToday(),
      startTime: "00:00",
      endTime: "23:59",
      status: "PUBLISHED",
      spaceId: space.id,
      maxGuests: 120,
      notes: "Salón principal. Service de catering incluido por el anfitrión.",
      createdById: admin.id,
      registrationOpen: true,
      registrationToken: generateInvitationToken(),
      registrationMaxPeople: 3,
      registrationAutoApprove: true,
    },
  });

  async function addGuest(opts: {
    firstName: string;
    lastName: string;
    document: string;
    phone?: string;
    status: "ENABLED" | "BLOCKED" | "PENDING";
    maxPeople: number;
    viaRegistration?: boolean;
  }) {
    const guest = await prisma.guest.create({
      data: {
        eventId: event.id,
        firstName: opts.firstName,
        lastName: opts.lastName,
        document: opts.document,
        phone: opts.phone,
        viaRegistration: opts.viaRegistration ?? false,
      },
    });

    const invitation = await prisma.invitation.create({
      data: {
        guestId: guest.id,
        eventId: event.id,
        token: generateInvitationToken(),
        shortCode: generateShortCode(),
        maxPeople: opts.maxPeople,
        status: opts.status,
      },
    });

    return { guest, invitation };
  }

  // Invitado con entrada válida, sin usar: para la invitación pública / QR y
  // para el escaneo "OK" en el scanner.
  const maria = await addGuest({
    firstName: "María",
    lastName: "López",
    document: "30111222",
    phone: "1122334455",
    status: "ENABLED",
    maxPeople: 2,
  });

  // Invitado bloqueado: para el escaneo "DENEGADO".
  const carlos = await addGuest({
    firstName: "Carlos",
    lastName: "Ibáñez",
    document: "28999888",
    status: "BLOCKED",
    maxPeople: 1,
  });

  // Invitado que ya entró (parcialmente): para historial, export y stats del
  // evento con datos reales en vez de ceros.
  // viaRegistration: true porque /mi-entrada (lib/registration.ts) solo
  // recupera entradas de invitados que se anotaron por el formulario público.
  const lucia = await addGuest({
    firstName: "Lucía",
    lastName: "Fernández",
    document: "35444555",
    phone: "1155667788",
    status: "ENABLED",
    maxPeople: 4,
    viaRegistration: true,
  });

  const checkin = await confirmCheckIn({
    code: lucia.invitation.token,
    eventId: event.id,
    people: 2,
    operatorId: admin.id,
    stationLabel: "Puerta 1",
  });
  if (checkin.result !== "OK") {
    throw new Error(`Check-in de prueba falló: ${JSON.stringify(checkin)}`);
  }

  console.log(
    JSON.stringify(
      {
        eventId: event.id,
        registrationToken: event.registrationToken,
        guests: {
          maria: { token: maria.invitation.token, shortCode: maria.invitation.shortCode },
          carlos: { token: carlos.invitation.token, shortCode: carlos.invitation.shortCode },
          lucia: { token: lucia.invitation.token, shortCode: lucia.invitation.shortCode },
        },
        miEntrada: { document: lucia.guest.document, lastName: lucia.guest.lastName },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
