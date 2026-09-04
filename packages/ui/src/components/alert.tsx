import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

type AlertVariant = "info" | "success" | "warning" | "error";

const CONFIG: Record<
  AlertVariant,
  { className: string; Icon: typeof Info }
> = {
  info: {
    className: "border-sky-200 bg-sky-50 text-sky-800",
    Icon: Info,
  },
  success: {
    className: "border-accent-200 bg-accent-50 text-accent-800",
    Icon: CircleCheck,
  },
  warning: {
    className: "border-amber-200 bg-amber-50 text-amber-900",
    Icon: TriangleAlert,
  },
  error: {
    className: "border-red-200 bg-red-50 text-red-800",
    Icon: CircleAlert,
  },
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: AlertProps) {
  const { className: variantClass, Icon } = CONFIG[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        variantClass,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
