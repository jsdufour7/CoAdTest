import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ArrowLeft, BadgeCheck, CircleX, Download, Hourglass } from "lucide-react";

import { getStaffSigningView } from "@coadvisor/documents";
import {
  SIGNER_STATUS_LABELS,
  SIGNING_MODE_LABELS,
} from "@coadvisor/documents/labels";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import { requireAdvisorContext } from "../../../lib/advisor-context";
import { StaffSigningPanel } from "./staff-signing-panel";

export const metadata: Metadata = { title: "Contre-signature" };

const COSIGNER_BADGES: Record<string, BadgeVariant> = {
  PENDING: "warning",
  SIGNED: "success",
  DECLINED: "danger",
};

/**
 * « Ouvrir et signer » du conseiller (Sprint 7c) : la contre-signature
 * se fait DANS le document, avec adoption façon DocuSign — plus de
 * va-et-vient entre téléchargement et formulaire.
 */
export default async function StaffSignPage({
  params,
}: {
  params: Promise<{ signerId: string }>;
}) {
  const { actor } = await requireAdvisorContext();
  const { signerId } = await params;

  const view = await getStaffSigningView(actor, signerId);
  if (!view) redirect("/signatures");

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8 lg:px-6">
        <Link
          href="/signatures"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à la console Signatures
        </Link>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {SIGNING_MODE_LABELS[view.signingMode]}
              </Badge>
              {view.status === "SIGNED" ? (
                <Badge variant="success">Contre-signée par vous</Badge>
              ) : view.status === "DECLINED" ? (
                <Badge variant="danger">Refusée par vous</Badge>
              ) : view.status === "OPEN" && view.myTurn ? (
                <Badge variant="warning">À contre-signer maintenant</Badge>
              ) : (
                <Badge variant="neutral">Tour d'un autre signataire</Badge>
              )}
            </div>
            <CardTitle className="text-xl">{view.document.label}</CardTitle>
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
                  Enveloppe séquentielle — un signataire doit compléter avant
                  vous ; la relecture reste possible ci-dessous.
                </p>
                <StaffSigningPanel signerId={signerId} view={view} readOnly />
              </div>
            ) : view.status === "OPEN" ? (
              <StaffSigningPanel signerId={signerId} view={view} />
            ) : (
              <div className="space-y-4">
                {view.status === "SIGNED" ? (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <BadgeCheck
                      className="mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p>
                      Votre contre-signature est consignée avec preuve
                      horodatée.
                      {view.signedAvailable
                        ? " La ronde est close : téléchargez le document final (avec certificat)."
                        : " Le document final sera disponible ici à la clôture de la ronde."}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <CircleX
                      className="mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p>
                      Vous avez refusé — le motif est consigné et la ronde est
                      close.
                    </p>
                  </div>
                )}
                {view.signedAvailable ? (
                  <a
                    href={`/signatures/${signerId}/telecharger`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    data-testid="staff-download-final"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Télécharger le document (avec certificat)
                  </a>
                ) : null}
                <StaffSigningPanel signerId={signerId} view={view} readOnly />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
