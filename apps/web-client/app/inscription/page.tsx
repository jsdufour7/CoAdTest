import Link from "next/link";
import type { Metadata } from "next";

import {
  AuthLayout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coadvisor/ui";

import { signupAction } from "./actions";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Créer mon compte" };

export default function InscriptionPage() {
  return (
    <AuthLayout
      productLabel="Espace client"
      brandPoints={[
        "Un compte gratuit pour suivre votre santé financière.",
        "Liez votre compte au dossier de votre conseiller avec un code d'invitation.",
        "Consentement explicite et données protégées (Loi 25).",
      ]}
      footerNote="© TwoDots.ca Ecosystem — Vos données restent les vôtres."
    >
      <Card>
        <CardHeader>
          <CardTitle>Créer mon compte</CardTitle>
          <CardDescription>
            Quelques secondes suffisent — vous lierez ensuite votre dossier avec
            le code remis par votre conseiller.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm
            action={signupAction}
            footer={
              <p className="text-center text-sm text-slate-500">
                Déjà un compte ?{" "}
                <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
                  Se connecter
                </Link>
              </p>
            }
          />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
