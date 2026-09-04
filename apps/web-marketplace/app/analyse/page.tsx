import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardContent, Logo } from "@coadvisor/ui";

import { QuestionnaireForm } from "./questionnaire-form";

export const metadata: Metadata = {
  title: "Analyse financière gratuite",
  description:
    "Obtenez votre portrait financier en moins de 3 minutes : score, forces, risques et priorités — gratuit et sans engagement.",
};

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<{ cabinet?: string }>;
}) {
  const { cabinet } = await searchParams;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-4 lg:px-6">
          <Link href="/" aria-label="Retour à l'accueil">
            <Logo size={30} />
          </Link>
          <div className="flex-1" />
          <Link
            href="/"
            className="text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            Retour à l'accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 lg:px-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Votre portrait financier en 3 minutes
          </h1>
          <p className="mt-2 text-slate-600">
            Anonyme, gratuit et sans engagement. Aucune coordonnée n'est
            demandée pour obtenir vos résultats.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <QuestionnaireForm cabinetSlug={cabinet} />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          Outil éducatif : le portrait ne constitue pas un conseil financier
          réglementé. Vos réponses servent uniquement au calcul — elles ne
          sont partagées avec un conseiller que si vous le demandez
          explicitement (Loi 25).
        </p>
      </main>
    </div>
  );
}
