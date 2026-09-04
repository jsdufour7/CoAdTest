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

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Créer mon espace" };

export default function SignupPage() {
  return (
    <AuthLayout
      productLabel="Nouveau cabinet"
      brandPoints={[
        "Votre environnement est créé en une seule étape — isolé et sécurisé dès la première seconde.",
        "Chaque action sensible est journalisée (audit immuable, conforme Loi 25).",
        "Invitez votre équipe immédiatement : conseillers, assistants, conformité.",
      ]}
      footerNote="© TwoDots.ca Ecosystem — Vos données restent les vôtres."
    >
      <Card>
        <CardHeader>
          <CardTitle>Créez l&apos;espace sécurisé de votre cabinet</CardTitle>
          <CardDescription>
            Vos données sont isolées, journalisées et hébergeables au Canada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SignupForm />
          <p className="text-center text-sm text-slate-500">
            Déjà un compte ?{" "}
            <Link
              href="/login"
              className="font-medium text-brand-700 hover:underline"
            >
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
