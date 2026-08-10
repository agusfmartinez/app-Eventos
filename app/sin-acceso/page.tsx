import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Sin acceso" };

export default function SinAccesoPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldAlert size={40} className="text-deny" />
      <h1 className="text-xl font-bold">No tenés acceso a esta sección</h1>
      <p className="max-w-sm text-sm text-muted">
        Tu cuenta no tiene permisos para ver esta página. Si creés que es un
        error, pedile a un administrador que revise tu rol.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
