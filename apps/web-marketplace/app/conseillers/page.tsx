import type { Metadata } from "next";

import { Search, ShieldCheck } from "lucide-react";

import {
  filterProfiles,
  LANGUAGE_LABELS,
  listPublicProfiles,
  MARKETPLACE_LANGUAGES,
  MARKETPLACE_SPECIALTIES,
  SPECIALTY_LABELS,
} from "@coadvisor/marketplace";
import type { MarketplaceSpecialty } from "@coadvisor/marketplace";
import {
  Button,
  EmptyState,
  Input,
  nativeSelectClass,
} from "@coadvisor/ui";

import { AdvisorCard } from "../../components/advisor-card";
import { PublicHeader } from "../../components/public-header";

export const metadata: Metadata = {
  title: "Trouver un conseiller financier",
  description:
    "Annuaire public des professionnels financiers CoAdvisor — recherche par spécialité, région et langue.",
};

export default async function AdvisorsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    specialite?: string;
    region?: string;
    langue?: string;
  }>;
}) {
  const { q, specialite, region, langue } = await searchParams;

  const specialty = MARKETPLACE_SPECIALTIES.includes(
    specialite as MarketplaceSpecialty,
  )
    ? (specialite as MarketplaceSpecialty)
    : undefined;

  const listed = await listPublicProfiles();
  const results = filterProfiles(listed, {
    query: q,
    specialty,
    region,
    language: langue,
  });
  const allRegions = [...new Set(listed.flatMap((p) => p.regions))].sort();

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <main className="mx-auto max-w-6xl px-4 py-10 lg:px-6">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Trouver un conseiller financier
          </h1>
          <p className="mt-2 leading-relaxed text-slate-600">
            Des professionnels qui ont choisi d'être visibles ici — aucun
            profil n'est publié sans consentement explicite. Vous gardez le
            contrôle : votre demande n'est transmise qu'au conseiller choisi.
          </p>
        </div>

        {/* Filtres */}
        <form
          method="GET"
          className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
        >
          <div className="min-w-56 flex-1">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nom, cabinet, mot-clé…"
              aria-label="Recherche textuelle"
            />
          </div>
          <select
            name="specialite"
            defaultValue={specialty ?? ""}
            className={nativeSelectClass("w-52")}
            aria-label="Spécialité"
          >
            <option value="">Toutes les spécialités</option>
            {MARKETPLACE_SPECIALTIES.map((spec) => (
              <option key={spec} value={spec}>
                {SPECIALTY_LABELS[spec]}
              </option>
            ))}
          </select>
          <div>
            <Input
              name="region"
              defaultValue={region ?? ""}
              placeholder="Région"
              aria-label="Région"
              list="regions-connues"
              className="w-44"
            />
            <datalist id="regions-connues">
              {allRegions.map((known) => (
                <option key={known} value={known} />
              ))}
            </datalist>
          </div>
          <select
            name="langue"
            defaultValue={langue ?? ""}
            className={nativeSelectClass("w-40")}
            aria-label="Langue"
          >
            <option value="">Toutes les langues</option>
            {MARKETPLACE_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {LANGUAGE_LABELS[language]}
              </option>
            ))}
          </select>
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden="true" />
            Filtrer
          </Button>
        </form>

        {results.length === 0 ? (
          <EmptyState
            title="Aucun conseiller ne correspond"
            description="Essayez d'élargir vos critères — de nouveaux profils s'ajoutent régulièrement."
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">
              {results.length} conseiller{results.length > 1 ? "s" : ""} visible
              {results.length > 1 ? "s" : ""} publiquement
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((profile) => (
                <AdvisorCard key={profile.profileId} profile={profile} />
              ))}
            </div>
          </>
        )}

        <p className="mt-10 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Les titres et certifications figurant sur les profils sont des
          informations déclaratives non vérifiées par CoAdvisor. Vérifiez
          toujours l'inscription d'un professionnel auprès de l'Autorité des
          marchés financiers (AMF) avant de faire affaire avec lui.
        </p>
      </main>
    </div>
  );
}
