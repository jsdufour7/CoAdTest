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
      productLabel="Espace professionnel"
      brandPoints={[
        "Votre profil professionnel public : spécialités, région, langues, certifications.",
        "Matching intelligent avec des prospects qualifiés — pas de démarchage.",
        "Prise de rendez-vous intégrée et suivi des mises en relation.",
      ]}
      footerNote="© TwoDots.ca Ecosystem — Vos données restent les vôtres."
    >
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Gérez votre profil public et vos mises en relation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm action={loginAction} />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
