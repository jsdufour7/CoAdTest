import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "../lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm",
        "placeholder:text-slate-400",
        "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        "disabled:cursor-not-allowed disabled:bg-slate-50",
        className,
      )}
      {...props}
    />
  );
});
