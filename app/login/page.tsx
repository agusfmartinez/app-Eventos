import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/authz";

import { LoginForm } from "./login-form";

export const metadata = { title: "Ingresar" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">Salón de Eventos</h1>
          <p className="mt-1 text-sm text-muted">
            Ingresá con tu cuenta del personal.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
