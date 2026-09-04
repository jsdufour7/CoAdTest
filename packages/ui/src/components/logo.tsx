import logoDarkPng from "../../assets/coadvisor-logo-dark.png";
import logoLightPng from "../../assets/coadvisor-logo-light.png";
import markDarkPng from "../../assets/coadvisor-mark-dark.png";
import markLightPng from "../../assets/coadvisor-mark-light.png";
import { cn } from "../lib/cn";

/** Logo officiel CoAdvisor — source : charte graphique (assets/). */
type ImportedImage = string | { src: string };

function srcOf(image: ImportedImage): string {
  return typeof image === "string" ? image : image.src;
}

const ASSETS = {
  default: {
    lockup: { src: srcOf(logoLightPng), ratio: 888 / 540 },
    mark: { src: srcOf(markLightPng), ratio: 734 / 383 },
  },
  inverted: {
    lockup: { src: srcOf(logoDarkPng), ratio: 287 / 182 },
    mark: { src: srcOf(markDarkPng), ratio: 235 / 126 },
  },
} as const;

export interface LogoProps {
  className?: string;
  /** Hauteur du logo en px (la largeur suit le ratio officiel). */
  size?: number;
  /** false = monogramme « CA » seul. */
  withWordmark?: boolean;
  /** "inverted" pour fonds foncés (panneau de marque navy). */
  variant?: "default" | "inverted";
}

/**
 * Logo officiel CoAdvisor — toujours issu de la charte (aucune déclinaison
 * maison). variant="default" sur fond clair, "inverted" sur fond foncé.
 */
export function Logo({
  className,
  size = 28,
  withWordmark = true,
  variant = "default",
}: LogoProps) {
  const set = ASSETS[variant];
  const asset = withWordmark ? set.lockup : set.mark;

  return (
    <img
      src={asset.src}
      alt="CoAdvisor — Système d'exploitation du conseil financier"
      height={size}
      width={Math.round(size * asset.ratio)}
      className={cn("h-auto w-auto select-none", className)}
      style={{ height: size, width: "auto" }}
      draggable={false}
    />
  );
}
