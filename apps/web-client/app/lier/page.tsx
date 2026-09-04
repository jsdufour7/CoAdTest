import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ShieldCheck } from "lucide-react";

import {
  AuthLayout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coadvisor/ui";

import { getSessionUserFromCookies } from "../../lib/session";
import { claimAction } from "./actions";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Lier mon dossier" };

export default async function LierPage() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <AuthLayout
      productLabel="Espace client"
      brandPoints={[
        "Votre conseiller vous a remis un code d'invitation à 8 caractères.",
        "La liaison se fait avec votre consentement explicite — révocable en tout temps.",
        "Vous verrez ensuite votre Financial Health Index, expliqué simplement.",
      ]}
      footerNote="© TwoDots.ca Ecosystem — Consentement horodaté (Loi 25)."
    >
      <Card>
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-brand-600">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle>Lier mon dossier</CardTitle>
          <CardDescription>
            Saisissez le code d&apos;invitation remis par votre conseiller pour
            accéder à votre santé financière.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimForm
            action={claimAction}
            email={user.email}
            footer={
              <p className="text-center text-xs text-slate-400">
                Votre consentement est enregistré avec date et heure. Vous pouvez
                demander la révocation à votre conseiller en tout temps.
              </p>
            }
          />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
