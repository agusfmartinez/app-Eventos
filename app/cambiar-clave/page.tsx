import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/authz";

import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Cambiar contraseña" };
export const dynamic = "force-dynamic";

/**
 * Vive fuera de los grupos (admin) y (scanner) a propósito: sus layouts usan
 * `requireAuth`, que redirige justamente acá cuando hay una contraseña
 * temporal pendiente. Anidarla adentro sería un bucle de redirecciones.
 */
export default async function CambiarClavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">
            {user.mustChangePassword ? "Elegí tu contraseña" : "Cambiar contraseña"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user.mustChangePassword
              ? "Tu cuenta tiene una contraseña temporal. Cambiala para poder seguir."
              : `Estás cambiando la contraseña de ${user.username}.`}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <ChangePasswordForm temporary={user.mustChangePassword} />
        </div>
      </div>
    </main>
  );
}
