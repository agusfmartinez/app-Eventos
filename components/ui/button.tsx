import type { ComponentProps } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60";

const variants = {
  primary: "bg-brand text-brand-foreground hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-background",
  ghost: "text-muted hover:bg-background hover:text-foreground",
  danger: "bg-deny text-white hover:opacity-90",
  dangerGhost: "text-deny hover:bg-deny-surface",
} as const;

const sizes = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2",
  // Para el scanner: el operador lo usa con una mano, en movimiento.
  lg: "px-5 py-3.5 text-base",
} as const;

type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

export function buttonClass(variant: Variant = "primary", size: Size = "md") {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button className={cn(buttonClass(variant, size), className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link className={cn(buttonClass(variant, size), className)} {...props} />
  );
}
