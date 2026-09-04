import type { Metadata } from "next";

import {
  BadgeCheck,
  Download,
  FileSignature,
  Hourglass,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { resolveExternalSigning } from "@coadvisor/documents";
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

import { PublicHeader } from "../../../components/public-header";
import { ExternalSigningPanel } from "./external-signing-panel";

export const metadata: Metadata = { title: "Signature électronique" };

const COSIGNER_BADGES: Record<string, BadgeVariant> = {
  PENDING: "warning",
  SIGNED: "success",
  DECLINED: "danger",
};

export default async function SignatureExternePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await resolveExternalSigning(token);

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        {!view ? (
          <ClosedCard
            title="Ce lien de signature n'est pas valide"
            description="Il n'a jamais existé ou a été saisi avec une erreur — demandez un nouveau lien à la personne qui vous l'avait transmis."
          />
        ) : view.status === "CLOSED" && !view.signedAvailable ? (
          <ClosedCard
            title="Cette demande de signature est close"
            description="L'enveloppe a expiré ou a été annulée — demandez un nouveau lien au professionnel si besoin."
          />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-5 w-5 text-emerald-600"
                  aria-hidden="true"
                />
                <Badge variant="success">Lien vérifié</Badge>
                <Badge variant="outline">
                  {SIGNING_MODE_LABELS[view.signingMode]}
                </Badge>
              </div>
              <CardTitle className="text-xl">
                {view.status === "SIGNED"
                  ? "Votre signature est consignée"
                  : view.status === "DECLINED"
                    ? "Vous avez refusé de signer ce document"
                    : view.status === "CLOSED"
                      ? "Ronde de signature close"
                      : "Signature électronique demandée"}
              </CardTitle>
              <CardDescription>
                {view.fullName} ({view.email}) — un professionnel CoAdvisor
                vous invite à signer la pièce ci-dessous. Chaque étape est
                horodatée et consignée au journal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <FileSignature className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {view.document.label}
                  </p>
                  <p className="text-xs text-slate-500">
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
                  </p>
                </div>
                {view.signedAvailable ? (
                  <a
                    href={`/signature/${token}/document`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    data-testid="external-download-final"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Télécharger le document final
                  </a>
                ) : null}
              </div>

              {view.message ? (
                <p className="rounded-lg bg-brand-50/60 px-3.5 py-2.5 text-sm italic text-slate-600">
                  « {view.message} »
                </p>
              ) : null}

              {view.cosigners.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">
                    Autres signataires de cette enveloppe :
                  </p>
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
                </div>
              ) : null}

              {view.status === "SIGNED" ? (
                <SignedBlock
                  signedAvailable={view.signedAvailable}
                  token={token}
                />
              ) : view.status === "DECLINED" ? (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  data-testid="external-declined-note"
                >
                  <p className="font-medium">
                    Votre refus est enregistré — le professionnel en a été
                    avisé.
                  </p>
                  {view.declinedReason ? (
                    <p className="mt-1 text-xs">
                      Motif consigné : « {view.declinedReason} ».
                    </p>
                  ) : null}
                </div>
              ) : view.status === "CLOSED" ? (
                <ClosedInSituBlock signedAvailable={view.signedAvailable} token={token} />
              ) : !view.myTurn ? (
                <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                  <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Enveloppe séquentielle — un autre signataire doit signer
                  avant vous. Revenez à ce lien un peu plus tard (un courriel
                  vous avisera).
                </p>
              ) : (
                <ExternalSigningPanel token={token} view={view} />
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function SignedBlock({
  signedAvailable,
  token,
}: {
  signedAvailable: boolean;
  token: string;
}) {
  return (
    <div className="space-y-3" data-testid="external-signed-state">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          Vous avez signé ce document électroniquement, avec preuve horodatée.
          {signedAvailable
            ? " La ronde est close : téléchargez le document final (avec certificat)."
            : " Le document final (avec certificat) pourra être téléchargé ici une fois toutes les signatures réunies."}
        </p>
      </div>
      {signedAvailable ? (
        <a
          href={`/signature/${token}/document`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          data-testid="external-download-signed"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Télécharger le document signé (avec certificat)
        </a>
      ) : null}
    </div>
  );
}

function ClosedInSituBlock({
  signedAvailable,
  token,
}: {
  signedAvailable: boolean;
  token: string;
}) {
  return (
    <div className="space-y-3" data-testid="external-closed-state">
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Cette ronde de signature est close — votre réponse n'était plus
        attendue au moment de la clôture.
      </p>
      {signedAvailable ? (
        <a
          href={`/signature/${token}/document`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          data-testid="external-download-closed"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Télécharger la copie close (avec certificat)
        </a>
      ) : null}
    </div>
  );
}

function ClosedCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
