import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import {
  ArrowLeft,
  BadgeCheck,
  CircleX,
  Download,
  Hourglass,
} from "lucide-react";

import { getPortalSigningView } from "@coadvisor/documents";
import {
  SIGNER_STATUS_LABELS,
  SIGNING_MODE_LABELS,
  formatBytes,
} from "@coadvisor/documents/labels";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import { PortalHeader } from "../../../../components/portal-header";
import { getSessionUserFromCookies } from "../../../../lib/session";
import { PortalSigningPanel } from "./portal-signing-panel";

export const metadata: Metadata = { title: "Signer le document" };

const COSIGNER_BADGES: Record<string, BadgeVariant> = {
  PENDING: "warning",
  SIGNED: "success",
  DECLINED: "danger",
};

export default async function PortailEnveloppePage({
  params,
}: {
  params: Promise<{ signerId: string }>;
}) {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login");
  const { signerId } = await params;

  const view = await getPortalSigningView(user.userId, signerId);
  if (!view) redirect("/espace");

  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader fullName={fullName} email={user.email} />
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8 lg:px-6">
        <Link
          href="/espace"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à mon espace
        </Link>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {SIGNING_MODE_LABELS[view.signingMode]}
              </Badge>
              {view.status === "SIGNED" ? (
                <Badge variant="success">Signée par vous</Badge>
              ) : view.status === "DECLINED" ? (
                <Badge variant="danger">Refusée par vous</Badge>
              ) : view.status === "OPEN" && view.myTurn ? (
                <Badge variant="warning">À signer maintenant</Badge>
              ) : view.status === "OPEN" ? (
                <Badge variant="neutral">Tour d'un autre signataire</Badge>
              ) : (
                <Badge variant="neutral">Ronde close</Badge>
              )}
            </div>
            <CardTitle className="text-xl">{view.document.label}</CardTitle>
            <CardDescription>
              Demande de {view.requestedByName} ·{" "}
              {formatBytes(view.document.sizeBytes)}
              {view.expiresAt && view.status === "OPEN" ? (
                <>
                  {" "}
                  · à signer avant le{" "}
                  {new Date(view.expiresAt).toLocaleDateString("fr-CA", {
                    dateStyle: "medium",
                  })}
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {view.message ? (
              <p className="rounded-lg bg-brand-50/60 px-3.5 py-2.5 text-sm italic text-slate-600">
                « {view.message} »
              </p>
            ) : null}

            {view.cosigners.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {view.cosigners.map((cosigner, index) => (
                  <Badge
                    key={`${cosigner.fullName}-${index}`}
                    variant={COSIGNER_BADGES[cosigner.status] ?? "neutral"}
                  >
                    {cosigner.fullName} ·{" "}
                    {SIGNER_STATUS_LABELS[
                      cosigner.status as keyof typeof SIGNER_STATUS_LABELS
                    ] ?? cosigner.status}
                  </Badge>
                ))}
              </div>
            ) : null}

            {view.status === "OPEN" && !view.myTurn ? (
              <div className="space-y-4">
                <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                  <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Enveloppe séquentielle — un autre signataire doit signer
                  avant vous ; un courriel vous avisera de votre tour.
                </p>
                <PortalSigningPanel
                  signerId={signerId}
                  view={view}
                  readOnly
                />
              </div>
            ) : view.status === "OPEN" ? (
              <PortalSigningPanel signerId={signerId} view={view} />
            ) : (
              <div className="space-y-4">
                {view.status === "SIGNED" ? (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <BadgeCheck
                      className="mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p>
                      Vous avez signé ce document électroniquement, avec preuve
                      horodatée.
                      {view.signedAvailable
                        ? " La ronde est close : téléchargez le document final (avec certificat)."
                        : " Le document final (avec certificat) pourra être téléchargé ici une fois toutes les signatures réunies — vous serez avisé."}
                    </p>
                  </div>
                ) : view.status === "DECLINED" ? (
                  <div
                    className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    data-testid="portal-declined-note"
                  >
                    <CircleX
                      className="mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p>
                      Vous avez refusé de signer — votre conseiller en a été
                      avisé
                      {view.declinedReason
                        ? ` (motif consigné : « ${view.declinedReason} »)`
                        : ""}
                      . La ronde est close.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Cette ronde de signature est close sans votre réponse.
                  </p>
                )}
                {view.signedAvailable ? (
                  <a
                    href={`/espace/enveloppe/${signerId}/telecharger`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    data-testid="portal-download-final"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Télécharger le document (avec certificat)
                  </a>
                ) : null}
                <PortalSigningPanel signerId={signerId} view={view} readOnly />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
