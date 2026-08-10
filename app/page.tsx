import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/authz";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * Puerta de entrada: manda a cada rol a donde corresponde.
 *
 * El personal de puerta va directo al scanner — no debería ni ver el panel.
 */
export default async function HomePage() {
  const user = await requireAuth();

  if (user.role === Role.DOOR) redirect("/control");

  redirect("/panel");
}
