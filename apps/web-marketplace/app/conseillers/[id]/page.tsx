import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ArrowLeft, BadgeCheck, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";

import {
  getPublicProfile,
  LANGUAGE_LABELS,
  SPECIALTY_LABELS,
} from "@coadvisor/marketplace";
import type { MarketplaceLanguage } from "@coadvisor/marketplace";
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle } from "@coadvisor/ui";

import { PublicHeader } from "../../../components/public-header";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Profil conseiller" };

export default async function AdvisorPublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assessment?: string; token?: string }>;
}) {
  const { id } = await params;
  const { assessment, token } = await searchParams;

  const profile = await getPublicProfile(id);
  if (!profile) {
    // Identique à inexistant (anti-énumération des profils non listés).
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <main className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
        <Link
          href="/conseillers"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à l'annuaire
        </Link>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Profil */}
          <div className="space-y-6 lg:col-span-3">
            <div className="flex items-start gap-4">
              {profile.photoUrl ?? profile.photoData ? (
                <img
                  src={profile.photoUrl ?? profile.photoData!}
                  alt={`Photo de ${profile.displayName}`}
                  className="h-20 w-20 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <Avatar name={profile.displayName} size="lg" className="h-20 w-20 text-xl" />
              )}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {profile.displayName}
                </h1>
                <p className="text-slate-500">{profile.firmName}</p>
                {profile.headline ? (
                  <p className="mt-1 font-medium text-brand-800">
                    {profile.headline}
                  </p>
                ) : null}
              </div>
            </div>

            {profile.bio ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sa approche</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {profile.bio}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spécialités et territoire</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {profile.specialties.map((specialty) => (
                    <Badge key={specialty} variant="outline">
                      {SPECIALTY_LABELS[specialty]}
                    </Badge>
                  ))}
                </div>
                <p className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  {profile.regions.join(" · ")}
                </p>
                <p className="text-sm text-slate-600">
                  Langues :{" "}
                  {profile.languages
                    .map((l) => LANGUAGE_LABELS[l as MarketplaceLanguage] ?? l)
                    .join(", ")}
                  {profile.yearsExperience !== null
                    ? ` · ${profile.yearsExperience} ans d'expérience`
                    : ""}
                </p>
                {profile.credentialsText ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900">
                      <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                      {profile.credentialsText}
                    </p>
                    <p className="mt-1 text-xs text-amber-800/80">
                      Informations déclaratives non vérifiées par CoAdvisor —
                      validez l'inscription du conseiller auprès de l'AMF.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Contact */}
          <Card className="h-fit border-brand-200 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                Contacter {profile.displayName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ContactForm
                profileId={profile.profileId}
                advisorName={profile.displayName}
                assessmentId={assessment}
                portraitToken={token}
              />
              <p className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Votre demande part directement dans la boîte de ce conseiller.
                CoAdvisor ne la consulte pas et n'y répond pas à sa place.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
