"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Usa el <dialog> nativo en vez de un div flotante: el navegador ya resuelve
 * el foco atrapado adentro, Escape para cerrar, el fondo inerte y el top-layer
 * (nada de z-index peleando con el header sticky).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // El evento close cubre también el Escape, que cierra el diálogo sin
      // pasar por ningún handler nuestro. Sin esto el estado quedaría en true
      // y el modal no volvería a abrirse.
      onClose={onClose}
      onClick={(e) => {
        // El click en el backdrop llega con el <dialog> como target: el
        // contenido está en el div de adentro.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground",
        "backdrop:bg-black/60",
        className,
      )}
    >
      {open ? (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{title}</h2>
              {description ? (
                <div className="mt-1 text-sm text-muted">{description}</div>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={16} />
            </Button>
          </div>

          {children}

          {footer ? (
            <div className="flex flex-wrap justify-end gap-2">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "primary",
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  pending?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={pending}>
            {pending ? "Procesando…" : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
