import type { ReactNode } from "react";

import { Logo } from "./logo";

export interface AuthLayoutProps {
  /** Ex. "Espace conseiller", "Espace client"… */
  productLabel: string;
  /** Arguments produit du panneau de marque (3-4 courts énoncés). */
  brandPoints: string[];
  /** Carte de formulaire. */
  children: ReactNode;
  footerNote?: ReactNode;
}

/**
 * Mise en page d'authentification split-screen :
 * panneau de marque (desktop) + zone de formulaire centrée.
 */
export function AuthLayout({
  productLabel,
  brandPoints,
  children,
  footerNote,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Panneau de marque */}
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-brand-950 p-10 text-white lg:flex xl:p-14">
        <div
          className="absolute inset-0 bg-dots text-white/[0.06]"
          aria-hidden="true"
        />
        <div className="relative">
          <Logo size={46} variant="inverted" />
        </div>
        <div className="relative space-y-6">
          <p className="text-sm font-medium uppercase tracking-widest text-accent-300">
            {productLabel}
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Le système d&apos;exploitation financier intelligent.
          </h2>
          <ul className="space-y-3.5">
            {brandPoints.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 text-sm leading-relaxed text-brand-100"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400"
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200/70">
          Conseillez mieux. Plus simplement. — Écosystème TwoDots.ca
        </p>
      </aside>

      {/* Zone formulaire */}
      <main className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <div className="mb-8 lg:hidden">
          <Logo size={38} />
        </div>
        <div className="w-full max-w-md">{children}</div>
        {footerNote ? (
          <p className="mt-8 max-w-md text-center text-xs text-slate-400">
            {footerNote}
          </p>
        ) : null}
      </main>
    </div>
  );
}
