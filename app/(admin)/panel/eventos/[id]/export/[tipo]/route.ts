import { buildCsv, csvFileName, csvResponse } from "@/lib/csv";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatDateTime,
  formatEventDateShort,
  personFullName,
} from "@/lib/format";
import { Role } from "@/lib/generated/prisma/enums";
import { deriveStatus, STATUS_LABELS } from "@/lib/invitation-status";

/**
 * Exportación a CSV de invitados e ingresos.
 *
 * Es un Route Handler y no una página, así que no puede apoyarse en el guard
 * del layout: verifica la sesión por su cuenta. Una URL que descarga la lista
 * completa de invitados con teléfonos no puede quedar abierta.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; tipo: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.ADMIN && user.role !== Role.ORGANIZER)) {
    return new Response("No autorizado.", { status: 403 });
  }

  const { id, tipo } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: { name: true, eventDate: true },
  });
  if (!event) return new Response("El evento no existe.", { status: 404 });

  const fileParts = [event.name, formatEventDateShort(event.eventDate)];

  if (tipo === "invitados") {
    const guests = await prisma.guest.findMany({
      where: { eventId: id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        notes: true,
        invitation: {
          select: {
            shortCode: true,
            maxPeople: true,
            enteredCount: true,
            status: true,
          },
        },
      },
    });

    const csv = buildCsv(
      [
        "Nombre",
        "Apellido",
        "Telefono",
        "Email",
        "Personas",
        "Ingresaron",
        "Estado",
        "Codigo",
        "Observaciones",
      ],
      guests.map((g) => [
        g.firstName,
        g.lastName,
        g.phone ?? "",
        g.email ?? "",
        g.invitation?.maxPeople ?? "",
        g.invitation?.enteredCount ?? "",
        g.invitation ? STATUS_LABELS[deriveStatus(g.invitation)] : "",
        g.invitation?.shortCode ?? "",
        g.notes ?? "",
      ]),
    );

    return csvResponse(csv, csvFileName([...fileParts, "invitados"]));
  }

  if (tipo === "ingresos") {
    const checkIns = await prisma.checkIn.findMany({
      where: { eventId: id },
      orderBy: { createdAt: "asc" },
      select: {
        peopleCount: true,
        createdAt: true,
        stationLabel: true,
        guest: { select: { firstName: true, lastName: true, phone: true } },
        invitation: { select: { shortCode: true } },
        operator: { select: { firstName: true, lastName: true } },
      },
    });

    const csv = buildCsv(
      [
        "Fecha y hora",
        "Nombre",
        "Apellido",
        "Telefono",
        "Personas",
        "Codigo",
        "Puesto",
        "Operador",
      ],
      checkIns.map((c) => [
        formatDateTime(c.createdAt),
        c.guest.firstName,
        c.guest.lastName,
        c.guest.phone ?? "",
        c.peopleCount,
        c.invitation.shortCode,
        c.stationLabel ?? "",
        c.operator ? personFullName(c.operator) : "",
      ]),
    );

    return csvResponse(csv, csvFileName([...fileParts, "ingresos"]));
  }

  return new Response("Tipo de exportación desconocido.", { status: 404 });
}
