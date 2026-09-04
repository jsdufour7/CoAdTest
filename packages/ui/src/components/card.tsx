import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Effet au survol (cartes cliquables/marketing). */
  interactive?: boolean;
}

export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-card",
        interactive
          ? "transition-shadow duration-150 hover:shadow-popover"
          : undefined,
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-slate-100 px-6 py-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-base font-semibold tracking-tight text-slate-900",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("mt-1 text-sm text-slate-500", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t border-slate-100 px-6 py-4", className)}
      {...props}
    />
  );
}

export interface SelectOption {
  value: string;
  label: ReactNode;
}

export function nativeSelectClass(className?: string): string {
  return cn(
    "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm",
    "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
    className,
  );
}
