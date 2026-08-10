import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const controlClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand disabled:opacity-60 aria-[invalid=true]:border-deny";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-deny">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-deny">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  error,
  ...props
}: ComponentProps<"input"> & { error?: string }) {
  return (
    <input
      aria-invalid={error ? true : undefined}
      className={cn(controlClass, className)}
      {...props}
    />
  );
}

export function Select({
  className,
  error,
  ...props
}: ComponentProps<"select"> & { error?: string }) {
  return (
    <select
      aria-invalid={error ? true : undefined}
      className={cn(controlClass, className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  error,
  ...props
}: ComponentProps<"textarea"> & { error?: string }) {
  return (
    <textarea
      aria-invalid={error ? true : undefined}
      className={cn(controlClass, "min-h-24 resize-y", className)}
      {...props}
    />
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-deny-surface px-3 py-2 text-sm text-deny"
    >
      {message}
    </p>
  );
}
