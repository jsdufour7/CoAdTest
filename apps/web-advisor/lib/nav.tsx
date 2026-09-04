import {
  BarChart3,
  CalendarDays,
  CreditCard,
  DatabaseBackup,
  FileSignature,
  Inbox,
  LayoutDashboard,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

import type { Membership } from "@coadvisor/core-platform";
import { operatorTenantSlug } from "@coadvisor/analytics";
import type { NavSection } from "@coadvisor/ui";

/**
 * Navigation principale de l'espace conseiller — calculée PAR contexte.
 *
 * « Sauvegardes » est une console d'opérations PLATEFORME (ADR-015) :
 * elle n'apparaît que pour un ADMIN du tenant opérateur
 * (PLATFORM_TENANT_SLUG) — un cabinet client n'a rien à y faire et ne
 * la verra jamais. La page elle-même revérifie le même gate (défense
 * en profondeur : la nav n'est qu'une commodité, pas une sécurité).
 */
export function advisorNavFor(
  membership: Pick<Membership, "tenantSlug" | "role">,
): NavSection[] {
  const isOperatorAdmin =
    membership.tenantSlug === operatorTenantSlug() &&
    membership.role === "ADMIN";

  const cabinetItems: NavSection["items"] = [
    {
      label: "Profil public",
      href: "/parametres/profil-public",
      icon: <Store className="h-4 w-4" />,
    },
    {
      label: "Conformité",
      href: "/parametres/conformite",
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      label: "Abonnement",
      href: "/abonnement",
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      label: "Statistiques",
      href: "/analytics",
      icon: <BarChart3 className="h-4 w-4" />,
    },
  ];
  if (isOperatorAdmin) {
    cabinetItems.push({
      label: "Sauvegardes",
      href: "/parametres/sauvegardes",
      icon: <DatabaseBackup className="h-4 w-4" />,
    });
  }

  return [
    {
      label: "Pilotage",
      items: [
        {
          label: "Tableau de bord",
          href: "/dashboard",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          label: "Clients",
          href: "/clients",
          icon: <Users className="h-4 w-4" />,
        },
        {
          label: "Signatures",
          href: "/signatures",
          icon: <FileSignature className="h-4 w-4" />,
        },
        {
          label: "Leads",
          href: "/leads",
          icon: <Inbox className="h-4 w-4" />,
        },
        {
          label: "Rencontres",
          icon: <CalendarDays className="h-4 w-4" />,
          badge: "Bientôt",
        },
      ],
    },
    {
      label: "Cabinet",
      items: cabinetItems,
    },
  ];
}
