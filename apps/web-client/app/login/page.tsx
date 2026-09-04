import type { Metadata } from "next";

import {
  AuthLayout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoginForm,
} from "@coadvisor/ui";

import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <AuthLayout
      productLabel="Espace client"
      brandPoints={[
        "Votre Financial Health Index, expliqué simplement — pas de jargon.",
        "Suivez votre progression dans le temps : liquidités, budget, dettes, épargne.",
        "Vos données vous appartiennent — consentement et confidentialité d'abord.",
      ]}
      footerNote="© TwoDots.ca Ecosystem — Vos données restent les vôtres."
    >
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Suivez votre santé financière en toute confiance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            action={loginAction}
            footer={
              <p className="text-center text-sm text-slate-500">
                Pas encore de compte ?{" "}
                <a href="/inscription" className="font-medium text-brand-600 hover:text-brand-700">
                  Créer mon compte
                </a>
              </p>
            }
          />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
