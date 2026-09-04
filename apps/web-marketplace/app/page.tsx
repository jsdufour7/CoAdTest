import Link from "next/link";

import { Activity, Lock, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";

import { Badge, Button, Card, CardContent } from "@coadvisor/ui";

import { PublicHeader } from "../components/public-header";

const VALUE_POINTS = [
  {
    icon: Activity,
    tint: "bg-accent-50 text-accent-600",
    title: "Analyse gratuite et score clair",
    text: "Votre Financial Health Index en quelques minutes — 10 catégories expliquées sans jargon, avec un rapport personnalisé.",
  },
  {
    icon: Users,
    tint: "bg-brand-50 text-brand-600",
    title: "Le bon professionnel",
    text: "Matching intelligent selon vos besoins, votre région et votre langue — pas un annuaire, une mise en relation pertinente.",
  },
  {
    icon: Lock,
    tint: "bg-sky-50 text-sky-600",
    title: "Confidentialité d'abord",
    text: "Consentement explicite, données hébergeables au Canada, journalisation complète. Conçu pour la Loi 25.",
  },
] as const;

/** Page publique — visiteurs (parcours découverte du PRD). */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      {/* Héros */}
      <section className="relative overflow-hidden border-b border-slate-100">
        <div
          className="absolute inset-0 bg-dots text-brand-100/70"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-7 px-4 py-24 text-center lg:py-32">
          <Badge variant="brand" className="px-3 py-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Financial Intelligence OS — propulsé par TwoDots.ca
          </Badge>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Comprenez votre santé financière.{" "}
            <span className="text-brand-700">
              Trouvez le bon professionnel.
            </span>
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-600">
            Analyse financière gratuite, Financial Health Index et rapport
            personnalisé — puis mise en relation avec un conseiller adapté à
            vos besoins.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/analyse">
              <Button size="lg">Faire mon analyse gratuite</Button>
            </Link>
            <Link href="/conseillers">
              <Button variant="secondary" size="lg">
                Trouver un conseiller
              </Button>
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-accent-600" />
              Conçu pour la Loi 25
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-accent-600" />
              Données hébergeables au Canada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent-600" />
              IA assistive, jamais de conseil réglementé automatisé
            </span>
          </div>
        </div>
      </section>

      {/* Proposition de valeur */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {VALUE_POINTS.map((point) => (
            <Card key={point.title} interactive>
              <CardContent className="space-y-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${point.tint} [&_svg]:h-5 [&_svg]:w-5`}
                >
                  <point.icon />
                </span>
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  {point.title}
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  {point.text}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pied de page */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-xs text-slate-400 sm:flex-row lg:px-6">
          <p>© 2026 TwoDots.ca Ecosystem</p>
          <p>CoAdvisor — future CoAdvisor Technologies Inc.</p>
        </div>
      </footer>
    </div>
  );
}
