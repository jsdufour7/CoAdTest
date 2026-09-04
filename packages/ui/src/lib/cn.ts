import { clsx } from "clsx";
import type { ClassValue } from "clsx";

/** Composition de classes utilitaires (design system). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
