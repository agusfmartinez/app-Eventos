"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Buscador de invitados.
 *
 * Escribe la búsqueda en la URL —así el resultado se puede compartir y el
 * botón de atrás funciona— pero con `router.replace`, que en el App Router es
 * una navegación blanda: se vuelve a renderizar el server component y se
 * reemplaza la lista, sin recargar el documento.
 *
 * Un `<form>` GET normal hacía una navegación completa en cada búsqueda: en la
 * puerta eso es medio segundo de pantalla en blanco con alguien esperando
 * enfrente, y en el celular además cierra el teclado.
 */
export function GuestSearch({
  defaultValue = "",
  placeholder = "Buscar por nombre o teléfono",
  className,
  inputClassName,
}: {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();

  // Lo que ya está en la URL. Sirve para no navegar de más: sin esto, montar
  // el componente con una búsqueda activa dispararía una navegación redundante.
  const appliedRef = useRef(defaultValue);

  useEffect(() => {
    if (value.trim() === appliedRef.current.trim()) return;

    // Se espera a que deje de tipear: una navegación por tecla sería una
    // consulta a la base por tecla.
    const timer = setTimeout(() => {
      appliedRef.current = value;
      const query = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : "";

      startTransition(() => {
        router.replace(`${window.location.pathname}${query}`, {
          scroll: false,
        });
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, router]);

  return (
    <div className={cn("relative", className)}>
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
      />

      <input
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // Enter no tiene que hacer nada: la búsqueda ya salió sola. Sin esto,
        // dentro de un form el navegador la manda de nuevo y recarga.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={placeholder}
        aria-label="Buscar invitados"
        autoComplete="off"
        className={cn(
          "w-full rounded-xl border border-border bg-surface py-3 pr-9 pl-9 text-base outline-none focus:border-brand",
          inputClassName,
        )}
      />

      {pending ? (
        <Loader2
          size={16}
          aria-label="Buscando"
          className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-muted"
        />
      ) : null}
    </div>
  );
}
