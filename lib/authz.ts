import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

/**
 * Sin RLS, la base no protege nada por sí sola: la autorización vive acá.
 *
 * Toda página protegida y TODA Server Action tiene que empezar llamando a
 * requireAuth(). Una acción sin guard es un agujero directo — ver ANALISIS.md
 * sección 4.
 */

/**
 * Devuelve el usuario de la sesión revalidado contra la base.
 *
 * La revalidación por request es a propósito: la sesión es un JWT, así que sin
 * consultar la base un operador desactivado seguiría entrando hasta que expire
 * el token. Al escalar esto son ~12 horas de acceso indebido. Una query por
 * request protegido es un precio barato para que bloquear a alguien tenga
 * efecto inmediato.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, fullName: true, role: true, active: true },
  });

  if (!user || !user.active) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

/** Exige sesión válida. Si se pasan roles, exige además uno de ellos. */
export async function requireAuth(
  ...allowedRoles: Role[]
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    redirect("/sin-acceso");
  }

  return user;
}

/** Atajo: solo personal que administra (no el control de acceso). */
export function requireAdminOrOrganizer() {
  return requireAuth(Role.ADMIN, Role.ORGANIZER);
}

/**
 * Verifica que el usuario pueda operar sobre un evento concreto.
 *
 * ADMIN y ORGANIZER alcanzan cualquier evento. El rol DOOR solo alcanza los
 * eventos donde está asignado en event_staff. Se usa en el scanner (Fase 4).
 */
export async function requireEventAccess(eventId: string): Promise<CurrentUser> {
  const user = await requireAuth();

  if (user.role === Role.ADMIN || user.role === Role.ORGANIZER) return user;

  const assignment = await prisma.eventStaff.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
    select: { eventId: true },
  });

  if (!assignment) redirect("/sin-acceso");

  return user;
}
