import Link from "next/link";
import type { Metadata } from "next";

import { ExternalLink, Globe, ShieldCheck } from "lucide-react";

import { hasPermission } from "@coadvisor/auth";
import { getMyPublicProfile } from "@coadvisor/marketplace";
import {
  AppShell,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../lib/advisor-context";
import { advisorNavFor } from "../../../lib/nav";
import { logoutAction } from "../../dashboard/actions";
import { ListingToggle } from "./listing-toggle";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profil public" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

const MARKETPLACE_URL =
  process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "http://localhost:3002";

export default async function PublicProfileSettingsPage() {
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const profile = await getMyPublicProfile(actor);
  const canWrite = hasPermission(actor.role, "marketplace:write");

  return (
    <AppShell
      currentPath="/parametres/profil-public"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: ROLE_LABELS[membership.role] ?? membership.role,
      }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Profil public"
      subtitle="Votre vitrine sur la place de marché CoAdvisor — vous contrôlez la visibilité"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Visibilité publique (OPT-IN) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-brand-500" aria-hidden="true" />
                <CardTitle>Visibilité sur la place publique</CardTitle>
              </div>
              {profile?.isListed ? (
                <Badge variant="success">Visible publiquement</Badge>
              ) : (
                <Badge variant="neutral">Non listé</Badge>
              )}
            </div>
            <CardDescription>
              {profile?.isListed && profile.listedAt
                ? `Visible depuis le ${new Date(profile.listedAt).toLocaleDateString("fr-CA", { dateStyle: "long" })} — consentement journalisé.`
                : "Aucun profil n'est public sans votre consentement explicite. L'activation est horodatée et journalisée (Loi 25)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canWrite ? (
              <ListingToggle isListed={profile?.isListed ?? false} />
            ) : (
              <p className="text-sm text-slate-500">
                Votre rôle ne permet pas de gérer la visibilité publique.
              </p>
            )}
            {profile?.isListed ? (
              <a
                href={`${MARKETPLACE_URL}/conseillers/${profile.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Voir mon annonce publique
              </a>
            ) : null}
          </CardContent>
        </Card>

        {/* Contenu du profil */}
        <Card>
          <CardHeader>
            <CardTitle>Contenu du profil</CardTitle>
            <CardDescription>
              Ces informations restent privées tant que la visibilité n'est
              pas activée. Le matching croise vos spécialités avec les
              priorités des visiteurs du questionnaire public.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <ProfileForm profile={profile} />
            ) : (
              <p className="text-sm text-slate-500">
                Votre rôle ne permet pas de modifier le profil public.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="flex items-start gap-2 pb-4 text-xs leading-relaxed text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Les titres et certifications sont affichés publiquement avec la
          mention « informations déclaratives non vérifiées par CoAdvisor ».
          Chaque activation/retrait de visibilité est consigné dans le journal
          d'audit de votre cabinet.
        </p>
      </div>
    </AppShell>
  );
}
