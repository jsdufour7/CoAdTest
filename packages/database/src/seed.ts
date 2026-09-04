/**
 * Seed de développement — crée un cabinet démo et son administrateur.
 *
 *   pnpm db:seed
 *
 * Identifiants démo (DEV UNIQUEMENT) :
 *   courriel    : demo@coadvisor.ca
 *   mot de passe: Demo#2026coadvisor
 *
 * Le seed est IDEMPOTENT : il crée uniquement les éléments manquants
 * (ré-exécutable à tout moment, jamais d'erreur P2002).
 */
import { hash } from "argon2";

import { prisma, withSystemContext } from "./index";

const DEMO_EMAIL = "demo@coadvisor.ca";
const DEMO_TENANT_SLUG = "cabinet-demo";

async function main() {
  const passwordHash = await hash("Demo#2026coadvisor");
  let created = 0;

  await withSystemContext(async (tx) => {
    // 1. Tenant démo
    let tenant = await tx.tenant.findUnique({
      where: { slug: DEMO_TENANT_SLUG },
    });
    if (!tenant) {
      tenant = await tx.tenant.create({
        data: { name: "Cabinet Démo", slug: DEMO_TENANT_SLUG, type: "FIRM" },
      });
      created += 1;
    }

    // 2. Utilisateur admin démo
    let user = await tx.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email: DEMO_EMAIL,
          firstName: "Marie",
          lastName: "Tremblay",
          passwordHash,
          status: "ACTIVE",
        },
      });
      created += 1;
    }

    // 3. Appartenance (rôle ADMIN)
    const membership = await tx.tenantUser.findUnique({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: user.id },
      },
    });
    if (!membership) {
      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: user.id, role: "ADMIN" },
      });
      created += 1;
    }

    // 4. Jeu de données CRM démo (Sprint 2) — un seul client enrichi,
    //    créé uniquement si le tenant n'a encore aucun dossier.
    const clientCount = await tx.client.count({
      where: { tenantId: tenant.id },
    });
    if (clientCount === 0) {
      const client = await tx.client.create({
        data: {
          tenantId: tenant.id,
          advisorId: user.id,
          firstName: "Jean",
          lastName: "Bouchard",
          type: "FAMILY",
          status: "ACTIVE",
          email: "jean.bouchard@exemple.ca",
          phone: "514-555-0182",
          birthDate: new Date("1978-04-12T00:00:00.000Z"),
        },
      });

      await tx.familyMember.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          firstName: "Sophie",
          lastName: "Bouchard",
          role: "SPOUSE",
          birthDate: new Date("1980-09-30T00:00:00.000Z"),
        },
      });

      await tx.timelineEvent.createMany({
        data: [
          {
            tenantId: tenant.id,
            clientId: client.id,
            eventType: "FINANCIAL_EVENT",
            title: "Dossier client créé",
            source: "SYSTEM",
            createdBy: user.id,
            eventDate: new Date("2026-07-20T14:00:00.000Z"),
          },
          {
            tenantId: tenant.id,
            clientId: client.id,
            eventType: "MEETING",
            title: "Première rencontre découverte",
            description:
              "Objectifs : retraite à 60 ans, optimisation REER/CELI, protection de la famille.",
            source: "MANUAL",
            createdBy: user.id,
            eventDate: new Date("2026-07-22T15:30:00.000Z"),
          },
        ],
      });

      await tx.note.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          authorId: user.id,
          type: "MEETING",
          content:
            "Rencontre découverte (45 min). Jean et Sophie souhaitent une planification retraite complète. Tolérance au risque : équilibrée. Documents à obtenir : relevés REER et dernier avis de cotisation.",
        },
      });

      await tx.task.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          createdBy: user.id,
          title: "Obtenir les relevés REER et l'avis de cotisation",
          priority: "HIGH",
          dueDate: new Date("2026-08-08T16:00:00.000Z"),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: user.id,
          action: "client.created",
          entityType: "Client",
          entityId: client.id,
          newData: { firstName: "Jean", lastName: "Bouchard", source: "seed" },
        },
      });
      created += 1;
    }

    // 4bis. Profil financier granulaire démo (Sprint 4) — alimente le FHI.
    //    L'indice lui-même n'est PAS seedé : il se calcule via le moteur
    //    (bouton « Calculer l'indice ») pour rester un snapshot authentique.
    const jean = await tx.client.findFirst({
      where: { tenantId: tenant.id, email: "jean.bouchard@exemple.ca" },
    });
    if (jean) {
      const incomeCount = await tx.income.count({
        where: { clientId: jean.id },
      });
      if (incomeCount === 0) {
        await tx.income.createMany({
          data: [
            { tenantId: tenant.id, clientId: jean.id, label: "Salaire — Jean", amount: 92_000, frequency: "ANNUAL", taxable: true },
            { tenantId: tenant.id, clientId: jean.id, label: "Salaire — Sophie", amount: 61_000, frequency: "ANNUAL", taxable: true },
          ],
        });
        await tx.expense.createMany({
          data: [
            { tenantId: tenant.id, clientId: jean.id, category: "HOUSING", label: "Habitation", amount: 1_850, frequency: "MONTHLY" },
            { tenantId: tenant.id, clientId: jean.id, category: "FOOD", label: "Alimentation", amount: 950, frequency: "MONTHLY" },
            { tenantId: tenant.id, clientId: jean.id, category: "TRANSPORT", label: "Transport", amount: 640, frequency: "MONTHLY" },
            { tenantId: tenant.id, clientId: jean.id, category: "UTILITIES", label: "Services publics", amount: 310, frequency: "MONTHLY" },
            { tenantId: tenant.id, clientId: jean.id, category: "LEISURE", label: "Loisirs", amount: 420, frequency: "MONTHLY" },
            { tenantId: tenant.id, clientId: jean.id, category: "SAVINGS", label: "Cotisations REER/CELI", amount: 1_000, frequency: "MONTHLY" },
          ],
        });
        await tx.asset.createMany({
          data: [
            { tenantId: tenant.id, clientId: jean.id, type: "CASH", label: "Liquidités — comptes bancaires", institution: "Banque Démo", value: 22_000, registered: false },
            { tenantId: tenant.id, clientId: jean.id, type: "INVESTMENT", label: "REER — fonds indiciels", institution: "Banque Démo", value: 118_000, registered: true },
            { tenantId: tenant.id, clientId: jean.id, type: "INVESTMENT", label: "Compte non enregistré", institution: "Courtage Démo", value: 34_000, registered: false },
            { tenantId: tenant.id, clientId: jean.id, type: "REAL_ESTATE", label: "Résidence principale", value: 465_000, registered: false },
          ],
        });
        await tx.liability.createMany({
          data: [
            { tenantId: tenant.id, clientId: jean.id, type: "MORTGAGE", label: "Hypothèque résidence", balance: 312_000, interestRate: 4.99, monthlyPayment: 1_750 },
            { tenantId: tenant.id, clientId: jean.id, type: "CREDIT_CARD", label: "Carte de crédit", balance: 2_400, interestRate: 19.99, monthlyPayment: 120 },
          ],
        });
        await tx.insurancePolicy.createMany({
          data: [
            { tenantId: tenant.id, clientId: jean.id, type: "LIFE", provider: "Assureur Démo", coverage: 500_000, premium: 68 },
            { tenantId: tenant.id, clientId: jean.id, type: "DISABILITY", provider: "Assureur Démo", coverage: 60_000, premium: 92 },
          ],
        });
        await tx.financialGoal.createMany({
          data: [
            { tenantId: tenant.id, clientId: jean.id, name: "Retraite confortable à 65 ans", targetAmount: 1_400_000, targetDate: new Date("2043-04-12T00:00:00.000Z"), priority: "HIGH", status: "ACTIVE" },
            { tenantId: tenant.id, clientId: jean.id, name: "Voyage en famille — Europe", targetAmount: 12_000, targetDate: new Date("2027-07-01T00:00:00.000Z"), priority: "LOW", status: "ACTIVE" },
          ],
        });
        await tx.retirementPlan.create({
          data: {
            tenantId: tenant.id,
            clientId: jean.id,
            retirementAge: 65,
            targetAnnualIncome: 68_000,
          },
        });
        await tx.financialContext.create({
          data: {
            tenantId: tenant.id,
            clientId: jean.id,
            registeredAccountsUsage: "PARTIAL",
            hasWill: true,
            beneficiariesStatus: "YES",
          },
        });
        created += 1;
        console.log("✔ Profil financier démo ajouté (Jean Bouchard) — calculez le FHI via le bouton « Calculer l'indice ».");
      }
    }

    // 4.5 Marketplace démo (Sprint 6) — un 2e conseiller + 2 profils
    //     publics LISTÉS (opt-in) couvrant les 6 spécialités : le
    //     matching recommande toujours quelqu'un depuis le portrait.
    let karim = await tx.user.findUnique({
      where: { email: "karim.haddad@coadvisor.ca" },
    });
    if (!karim) {
      karim = await tx.user.create({
        data: {
          email: "karim.haddad@coadvisor.ca",
          firstName: "Karim",
          lastName: "Haddad",
          passwordHash,
          status: "ACTIVE",
        },
      });
      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: karim.id, role: "ADVISOR" },
      });
      created += 1;
    }

    const seedProfile = async (
      advisorId: string,
      data: {
        displayName: string;
        headline: string;
        bio: string;
        regions: string[];
        languages: string[];
        specialties: (
          | "EMERGENCY_FUND" | "DEBT" | "SAVINGS"
          | "RETIREMENT" | "PROTECTION" | "GOALS"
        )[];
        yearsExperience: number;
        credentialsText: string;
      },
    ) => {
      const existing = await tx.advisorPublicProfile.findUnique({
        where: { advisorId },
      });
      if (!existing) {
        await tx.advisorPublicProfile.create({
          data: {
            tenantId: tenant.id,
            advisorId,
            ...data,
            isListed: true,
            listedAt: new Date(),
          },
        });
        created += 1;
      }
    };

    await seedProfile(user.id, {
      displayName: "Marie Tremblay",
      headline: "Planificatrice financière — retraite et épargne des familles",
      bio:
        "J'accompagne les familles du Grand Montréal vers une retraite sereine : " +
        "plan de décaissement, optimisation REER/CELI et discipline d'épargne. " +
        "Mon approche : des stratégies simples à comprendre, revues chaque année, " +
        "et des chiffres honnêtes plutôt que des promesses.",
      regions: ["Montréal", "Laval"],
      languages: ["fr", "en"],
      specialties: ["RETIREMENT", "SAVINGS", "GOALS"],
      yearsExperience: 12,
      credentialsText:
        "Pl. Fin. (IQPF) · Représentante en épargne collective — informations déclaratives",
    });

    await seedProfile(karim.id, {
      displayName: "Karim Haddad",
      headline: "Conseiller en sécurité financière — protection et désendettement",
      bio:
        "Assurance vie, invalidité et remise sur pied budgétaire : je sécurise " +
        "d'abord vos fondations (fonds d'urgence, protection des proches), puis " +
        "nous attaquons les dettes dans le bon ordre. Rencontres possibles " +
        "rapidement, en français, à Montréal comme sur la Rive-Sud.",
      regions: ["Montréal", "Longueuil"],
      languages: ["fr"],
      specialties: ["PROTECTION", "DEBT", "EMERGENCY_FUND"],
      yearsExperience: 8,
      credentialsText:
        "Certificat en assurance de personnes (AMF, déclaratif) · 8 ans en cabinet",
    });

    // 5. Audit uniquement si quelque chose a réellement été créé
    if (created > 0) {
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: user.id,
          action: "tenant.created",
          entityType: "Tenant",
          entityId: tenant.id,
          newData: { name: tenant.name, slug: tenant.slug, source: "seed" },
        },
      });
      console.log(
        `✔ Seed appliqué : ${tenant.name} (${created} élément(s) créé(s))`,
      );
    }
  });

  if (created === 0) {
    console.log("Seed déjà appliqué — rien à faire.");
  }
}

main()
  .catch((error) => {
    console.error("Échec du seed :", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
