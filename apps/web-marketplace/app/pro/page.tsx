import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ArrowUpRight, MapPin, Store } from "lucide-react";

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Logo,
} from "@coadvisor/ui";
import {
  getMyPublicProfile,
  LANGUAGE_LABELS,
  SPECIALTY_LABELS,
} from "@coadvisor/marketplace";
import type { MarketplaceLanguage } from "@coadvisor/marketplace";
import { getUserTenants } from "@coadvisor/core-platform";

import { getSessionUserFromCookies } from "../../lib/session";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "Espace professionnel" };
export const dynamic = "force-dynamic";

/** Console conseiller (propriétaire unique de l'édition du profil). */
const ADVISOR_APP_URL =
  process.env.WEB_ADVISOR_URL ?? "http://localhost:3000";

export default async function ProPage() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const fullName = `${user.firstName} ${user.lastName}`;
  const [membership] = await getUserTenants(user.userId);

  // État RÉEL du profil public (Sprint 6) — lu sous RLS tenante.
  const profile = membership
    ? await getMyPublicProfile({
        userId: user.userId,
        tenantId: membership.tenantId,
        role: membership.role,
      }).catch(() => null)
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 lg:px-6">
          <Logo size={32} />
          <span className="text-sm font-medium text-slate-500">
            Espace professionnel
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <Avatar name={fullName} size="sm" />
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-slate-800">{fullName}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 lg:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Votre présence sur la place de marché
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Profil public{membership ? ` — ${membership.tenantName}` : ""}.
            Vitrine, matching et (bientôt) rendez-vous.
          </p>
        </div>

        {profile ? (
          <Card data-testid="pro-profile-card">
            <CardContent className="space-y-5 pt-6">
              <div className="flex items-start gap-4">
                {profile.photoUrl ?? profile.photoData ? (
                  <img
                    src={profile.photoUrl ?? profile.photoData!}
                    alt={`Photo de ${profile.displayName}`}
                    className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <Avatar name={profile.displayName} size="lg" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-slate-900">
                      {profile.displayName}
                    </p>
                    {profile.isListed ? (
                      <Badge variant="success">
                        Visible dans l&apos;annuaire
                      </Badge>
                    ) : (
                      <Badge variant="neutral">Vitrine masquée</Badge>
                    )}
                  </div>
                  {profile.headline ? (
                    <p className="mt-0.5 text-sm text-slate-600">
                      {profile.headline}
                    </p>
                  ) : null}
                  {profile.isListed && profile.listedAt ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Vitrine activée le{" "}
                      {new Date(profile.listedAt).toLocaleDateString("fr-CA", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {profile.specialties.slice(0, 4).map((specialty) => (
                  <Badge key={specialty} variant="outline">
                    {SPECIALTY_LABELS[specialty]}
                  </Badge>
                ))}
              </div>

              <p className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {profile.regions.join(", ")} ·{" "}
                {profile.languages
                  .map((l) => LANGUAGE_LABELS[l as MarketplaceLanguage] ?? l)
                  .join(", ")}
              </p>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                {profile.isListed ? (
                  <a
                    href={`/conseillers/${profile.id}`}
                    data-testid="pro-public-link"
                  >
                    <Button variant="secondary" size="sm">
                      Voir ma fiche publique
                      <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden />
                    </Button>
                  </a>
                ) : null}
                <a
                  href={`${ADVISOR_APP_URL}/parametres/profil-public`}
                  data-testid="pro-cta-console"
                >
                  <Button size="sm">
                    <Store className="mr-1.5 h-4 w-4" aria-hidden />
                    Gérer mon profil (console conseiller)
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={<Store />}
                title="Aucun profil public pour ce compte"
                description="Le profil professionnel (spécialités, régions, langues, certifications, photo) et la visibilité dans l'annuaire sont déjà livrés — ils se gèrent depuis la console conseiller."
                action={
                  <a
                    href={`${ADVISOR_APP_URL}/parametres/profil-public`}
                    data-testid="pro-cta-console"
                  >
                    <Button size="sm">Ouvrir la console conseiller</Button>
                  </a>
                }
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <Badge variant="brand">Sprint 9</Badge>
            <p className="text-sm text-slate-600">
              <span className="font-medium">Rencontres intégrées</span> — la
              prise de rendez-vous prospect ↔ conseiller arrive avec le
              chantier « Rencontres » (agenda, rappels courriel, export
              .ics).
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
