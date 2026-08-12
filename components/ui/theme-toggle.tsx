"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Botón de tema claro / oscuro.
 *
 * No usa estado de React a propósito. El tema lo define un script antes de
 * hidratar (ver `app/layout.tsx`), así que si el ícono dependiera de estado el
 * servidor renderizaría uno y el navegador otro — la discrepancia de
 * hidratación clásica de los selectores de tema.
 *
 * En su lugar se renderizan los dos íconos y el CSS muestra el que
 * corresponde según `data-theme` (ver `app/globals.css`). El click solo
 * escribe el atributo y lo guarda; nada vuelve a renderizarse.
 *
 * La elección se guarda por dispositivo: la tablet de la puerta puede quedar
 * en oscuro aunque la notebook del panel esté en claro.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("tema", next);
    } catch {
      // Almacenamiento bloqueado: el tema igual cambia, solo no se recuerda.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar tema"
      className={`flex items-center rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground ${className}`}
    >
      <Moon size={16} className="icon-when-light" />
      <Sun size={16} className="icon-when-dark" />
    </button>
  );
}
