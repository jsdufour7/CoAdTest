import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn";
import { Input } from "./input";

export interface TextFieldProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Icône décorative à gauche du champ (ex. lucide-react). */
  icon?: ReactNode;
  containerClassName?: string;
}

/**
 * Champ de formulaire standardisé : label, icône optionnelle,
 * message d'erreur (aria) ou hint.
 */
export function TextField({
  label,
  hint,
  error,
  icon,
  id,
  name,
  containerClassName,
  ...inputProps
}: TextFieldProps) {
  const errorId = id ? `${id}-error` : undefined;
  const hintId = id ? `${id}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", containerClassName)}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        ) : null}
        <Input
          id={id}
          name={name ?? id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            icon ? "pl-9" : undefined,
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-500"
              : undefined,
          )}
          {...inputProps}
        />
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
