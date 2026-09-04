import Link from "next/link";
import type { Metadata } from "next";

import {
  AppShell,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../lib/advisor-context";
import { advisorNavFor } from "../../../lib/nav";
import { logoutAction } from "../../dashboard/actions";
import { NewClientForm } from "./new-client-form";

export const metadata: Metadata = { title: "Nouveau client" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

export default async function NewClientPage() {
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);

  return (
    <AppShell
      currentPath="/clients"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: ROLE_LABELS[membership.role] ?? membership.role,
      }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Nouveau client"
      subtitle="Création d'un dossier — audit consigné automatiquement"
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Dossier client</CardTitle>
          <CardDescription>
            Identité de base — la situation familiale et financière
            s&apos;enrichira dans la fiche.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewClientForm />
        </CardContent>
      </Card>
    </AppShell>
  );
}
