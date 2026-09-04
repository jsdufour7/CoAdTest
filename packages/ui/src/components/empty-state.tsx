import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** État vide standard : à utiliser partout où une liste/section n'a rien à montrer. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-1 text-slate-400 [&_svg]:h-8 [&_svg]:w-8">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
