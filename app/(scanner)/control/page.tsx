import { ScanLine } from "lucide-react";

import { logoutAction } from "@/lib/actions/session";
import { requireAuth } from "@/lib/authz";

export const metadata = { title: "Control de acceso" };

/**
 * Placeholder de la Fase 4.
 *
 * Vive fuera del grupo (admin) a propósito: el rol DOOR tiene que poder entrar
 * acá, y el layout del panel lo rechazaría.
 */
export default async function ControlPage() {
  const user = await requireAuth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <ScanLine size={40} className="text-brand" />
      <h1 className="text-xl font-bold">Control de acceso</h1>
      <p className="max-w-sm text-sm text-muted">
        El escáner de QR llega en la Fase 4. Tu sesión está activa como{" "}
        <strong className="text-foreground">{user.fullName}</strong> (
        {user.role}).
      </p>

      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-background"
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
