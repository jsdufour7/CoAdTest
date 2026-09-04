import Link from "next/link";
import type { Metadata } from "next";

import {
  Download,
  FileText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { resolvePublicShare } from "@coadvisor/documents";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coadvisor/ui";

import { PublicHeader } from "../../../components/public-header";

export const metadata: Metadata = { title: "Document partagé" };

export default async function PartagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Jeton URL-safe valide (base64url, 43 caractères pour 32 octets) —
  // un token malformé ne connaîtra jamais de haché correspondant.
  const isTokenShape = /^[A-Za-z0-9_-]{20,90}$/.test(token);
  const share = isTokenShape ? await resolvePublicShare(token) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader />
      <main className="mx-auto max-w-2xl px-4 py-12">
        {!share ? (
          <Card>
            <CardHeader className="items-center text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                <ShieldAlert className="h-6 w-6" aria-hidden="true" />
              </span>
              <CardTitle className="text-xl">Ce lien n'est plus valide</CardTitle>
              <CardDescription className="max-w-md">
                Le document a été retiré du partage, le lien a expiré (validité
                7 jours) ou il n'a jamais existé. Demandez un nouveau lien à la
                personne qui vous l'avait transmis.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Link href="/">
                <Button variant="secondary" size="sm">
                  Retour à l'accueil CoAdvisor
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                <Badge variant="success">Lien vérifié</Badge>
              </div>
              <CardTitle className="text-xl">Document partagé avec vous</CardTitle>
              <CardDescription>
                Partagé par {share.firmName ?? "un professionnel CoAdvisor"} via
                le coffre chiffré — le téléchargement est journalisé.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {share.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {share.mimeType} · {(share.sizeBytes / 1024).toFixed(0)} Ko
                    {share.expiresAt
                      ? ` · lien valide jusqu'au ${share.expiresAt.toLocaleDateString("fr-CA", { dateStyle: "long" })}`
                      : ""}
                  </p>
                </div>
                <a href={`/partage/${token}/telechargement`}>
                  <Button size="sm">
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Télécharger
                  </Button>
                </a>
              </div>

              <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
                <p>
                  <strong className="font-medium text-slate-600">
                    Vérification d'intégrité (optionnelle)
                  </strong>{" "}
                  — l'empreinte SHA-256 du contenu est{" "}
                  <code className="break-all text-[10px] text-slate-600">
                    {share.sha256}
                  </code>
                  . Toute altération du fichier la ferait diverger.
                </p>
              </div>

              <p className="text-center text-xs text-slate-400">
                Partagé via le coffre documentaire CoAdvisor — chiffrement du
                contenu au repos, aucun lien public permanent.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
