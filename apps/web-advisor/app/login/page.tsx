import Link from "next/link";
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
      productLabel="Espace conseiller"
      brandPoints={[
        "Données clients isolées et journalisées — conformité Loi 25 par conception.",
        "Moins d'administration, plus de conseil : préparation de rencontres assistée par IA.",
        "Votre cabinet, votre environnement sécurisé — hébergeable au Canada.",
      ]}
      footerNote="© TwoDots.ca Ecosystem — Vos données restent les vôtres."
    >
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Accédez à l&apos;environnement sécurisé de votre cabinet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            action={loginAction}
            footer={
              <p className="text-center text-sm text-slate-500">
                Nouveau cabinet ?{" "}
                <Link
                  href="/signup"
                  className="font-medium text-brand-700 hover:underline"
                >
                  Créer mon espace
                </Link>
              </p>
            }
          />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
