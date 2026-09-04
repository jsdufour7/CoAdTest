import { cn } from "../lib/cn";

const PALETTES = [
  "bg-brand-100 text-brand-700",
  "bg-accent-100 text-accent-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
] as const;

const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
} as const;

export interface AvatarProps {
  /** Nom complet — les initiales sont dérivées automatiquement. */
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0]! : "")
  ).toUpperCase();
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        SIZES[size],
        PALETTES[hash % PALETTES.length],
        className,
      )}
    >
      {initials || "·"}
    </span>
  );
}
