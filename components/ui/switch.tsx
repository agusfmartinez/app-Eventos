import type { ReactNode } from "react";

/**
 * Interruptor de encendido/apagado.
 *
 * Por dentro sigue siendo un `<input type="checkbox">`: viaja en el FormData
 * como cualquier checkbox —presente cuando está prendido, ausente cuando no— y
 * las Server Actions no se enteran del cambio. Lo único que cambia es el
 * dibujo, con `peer-checked` sobre el input escondido.
 *
 * La etiqueta envuelve todo, así que tocar el texto también lo conmuta: en el
 * teléfono, apuntarle a un cuadradito de 16px es una lotería.
 */
export function Switch({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          disabled={disabled}
          className="peer absolute h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:opacity-50" />
        <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 peer-disabled:opacity-50" />
      </span>

      <span>
        {label}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
