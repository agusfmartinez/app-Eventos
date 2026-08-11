import "server-only";

import { prisma } from "@/lib/db";
import { InvitationStatus } from "@/lib/generated/prisma/enums";

export type EventStats = {
  guests: number;
  enabled: number;
  pending: number;
  blocked: number;
  /** Personas que ya ingresaron. */
  entered: number;
  /** Personas autorizadas en total (suma de cupos). */
  capacity: number;
  /** Invitaciones que ya usaron todo su cupo. */
  fullyEntered: number;
  /** Invitaciones que entraron en parte. */
  partiallyEntered: number;
  /** Invitaciones habilitadas que todavía no llegaron. */
  notArrived: number;
};

export async function getEventStats(eventId: string): Promise<EventStats> {
  const invitations = await prisma.invitation.findMany({
    where: { eventId },
    select: { status: true, maxPeople: true, enteredCount: true },
  });

  const stats: EventStats = {
    guests: invitations.length,
    enabled: 0,
    pending: 0,
    blocked: 0,
    entered: 0,
    capacity: 0,
    fullyEntered: 0,
    partiallyEntered: 0,
    notArrived: 0,
  };

  for (const inv of invitations) {
    stats.capacity += inv.maxPeople;
    stats.entered += inv.enteredCount;

    if (inv.status === InvitationStatus.PENDING) stats.pending += 1;
    else if (
      inv.status === InvitationStatus.BLOCKED ||
      inv.status === InvitationStatus.CANCELLED
    ) {
      stats.blocked += 1;
    } else {
      stats.enabled += 1;
    }

    if (inv.enteredCount >= inv.maxPeople) stats.fullyEntered += 1;
    else if (inv.enteredCount > 0) stats.partiallyEntered += 1;
    else if (inv.status === InvitationStatus.ENABLED) stats.notArrived += 1;
  }

  return stats;
}

export type HourlyBucket = { hour: string; people: number };

/**
 * Ingresos agrupados por hora local del salón.
 *
 * La agrupación se hace en SQL con `AT TIME ZONE` en vez de en JavaScript
 * porque la conversión tiene que usar la zona del salón: agrupar por hora UTC
 * partiría la noche en dos y mostraría la fiesta empezando a las 00:00.
 */
export async function getHourlyEntries(
  eventId: string,
): Promise<HourlyBucket[]> {
  const rows = await prisma.$queryRaw<{ hour: string; people: bigint }[]>`
    SELECT
      to_char(
        date_trunc('hour', created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        'DD/MM HH24:00'
      ) AS hour,
      SUM(people_count) AS people
    FROM check_ins
    WHERE event_id = ${eventId}::uuid
    GROUP BY 1
    ORDER BY MIN(created_at)
  `;

  return rows.map((row) => ({ hour: row.hour, people: Number(row.people) }));
}
