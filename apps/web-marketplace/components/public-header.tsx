import Link from "next/link";

import { Button, Logo } from "@coadvisor/ui";

/**
 * En-tête public partagé (place de marché) — extrait de la page
 * d'accueil au Sprint 6 pour éviter la duplication (Règle kit).
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 lg:px-6">
        <Link href="/" aria-label="Accueil CoAdvisor">
          <Logo size={32} />
        </Link>
        <nav className="ml-2 hidden items-center gap-5 text-sm font-medium text-slate-600 sm:flex">
          <Link href="/analyse" className="hover:text-brand-700">
            Analyse gratuite
          </Link>
          <Link href="/conseillers" className="hover:text-brand-700">
            Trouver un conseiller
          </Link>
        </nav>
        <div className="flex-1" />
        <Link href="/login">
          <Button variant="secondary" size="sm">
            Espace professionnel
          </Button>
        </Link>
      </div>
    </header>
  );
}
