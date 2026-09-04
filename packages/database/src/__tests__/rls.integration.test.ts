/**
 * Tests d'intégration RLS — exigent une base PostgreSQL migrée.
 *
 *   RUN_DB_TESTS=1 DATABASE_URL=... pnpm --filter @coadvisor/database test
 *
 * CRITIQUE SÉCURITÉ : ces tests prouvent qu'un tenant ne peut JAMAIS
 * lire ni écrire les données d'un autre tenant, même en contournant
 * la couche applicative (défense en profondeur — ADR-003).
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  withDocumentShareContext,
  withMarketplacePublicContext,
  withPublicContext,
  withSignatureTokenContext,
  withSystemContext,
  withTenantContext,
} from "../index";
import type { DbContext } from "../index";

const RUN = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!RUN)("Isolation multi-tenant (RLS PostgreSQL)", () => {
  it("un tenant ne lit que ses propres données", async () => {
    const suffix = Date.now().toString(36);
    const { tenantA, tenantB } = await withSystemContext(async (tx) => {
      const tenantA = await tx.tenant.create({
        data: { name: "Tenant A", slug: `tenant-a-${suffix}` },
      });
      const tenantB = await tx.tenant.create({
        data: { name: "Tenant B", slug: `tenant-b-${suffix}` },
      });
      return { tenantA, tenantB };
    });

    // findMany : confinement strict au tenant courant
    const seenByA = await withTenantContext(tenantA.id, null, (tx) =>
      tx.tenant.findMany({ select: { id: true } }),
    );
    expect(seenByA.map((t) => t.id)).toEqual([tenantA.id]);

    // findUnique direct sur le tenant B depuis le contexte A : refusé
    const crossRead = await withTenantContext(tenantA.id, null, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantB.id } }),
    );
    expect(crossRead).toBeNull();

    // Écriture dans un tenant étranger (WITH CHECK) : rejetée par la RLS
    // (FK valides → seule la politique peut bloquer cette insertion)
    await expect(
      withTenantContext(tenantA.id, null, (tx) =>
        tx.auditLog.create({
          data: {
            tenantId: tenantB.id,
            action: "injection.tentative",
            entityType: "Tenant",
            entityId: tenantB.id,
          },
        }),
      ),
    ).rejects.toThrow();

    // Nettoyage (contexte système)
    await withSystemContext(async (tx) => {
      await tx.tenant.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
      });
    });
  });

  it("les dossiers clients (et données liées) sont cloisonnés par tenant", async () => {
    const suffix = Date.now().toString(36);
    const { tenantA, tenantB, clientB } = await withSystemContext(
      async (tx) => {
        const tenantA = await tx.tenant.create({
          data: { name: "Tenant CRM A", slug: `crm-a-${suffix}` },
        });
        const tenantB = await tx.tenant.create({
          data: { name: "Tenant CRM B", slug: `crm-b-${suffix}` },
        });
        const advisorB = await tx.user.create({
          data: {
            email: `advisor-b-${suffix}@test.local`,
            firstName: "Conseiller",
            lastName: "B",
            passwordHash: "hash-de-test",
          },
        });
        const clientB = await tx.client.create({
          data: {
            tenantId: tenantB.id,
            advisorId: advisorB.id,
            firstName: "Jeanne",
            lastName: "Invisible",
            type: "INDIVIDUAL",
          },
        });
        // Données liées au dossier de B (famille, note, tâche, timeline)
        await tx.familyMember.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            firstName: "Conjoint",
            lastName: "Invisible",
            role: "SPOUSE",
          },
        });
        await tx.note.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            authorId: advisorB.id,
            type: "OBSERVATION",
            content: "Note confidentielle du tenant B",
          },
        });
        await tx.task.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            createdBy: advisorB.id,
            title: "Tâche confidentielle du tenant B",
          },
        });
        await tx.timelineEvent.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            eventType: "FINANCIAL_EVENT",
            title: "Création",
          },
        });
        return { tenantA, tenantB, clientB };
      },
    );

    // Le tenant A ne voit AUCUN client (le dossier appartient à B)
    const clientsSeenByA = await withTenantContext(tenantA.id, null, (tx) =>
      tx.client.findMany({ select: { id: true } }),
    );
    expect(clientsSeenByA).toHaveLength(0);

    // Accès direct par identifiant depuis A : refusé
    const crossClient = await withTenantContext(tenantA.id, null, (tx) =>
      tx.client.findUnique({ where: { id: clientB.id } }),
    );
    expect(crossClient).toBeNull();

    // Les tables liées (notes, tâches, famille, timeline) sont cloisonnées
    const relatedProbes: Array<(tx: DbContext) => Promise<unknown[]>> = [
      (tx) => tx.note.findMany({ select: { id: true } }),
      (tx) => tx.task.findMany({ select: { id: true } }),
      (tx) => tx.familyMember.findMany({ select: { id: true } }),
      (tx) => tx.timelineEvent.findMany({ select: { id: true } }),
    ];
    for (const probe of relatedProbes) {
      const rows = await withTenantContext(tenantA.id, null, probe);
      expect(rows).toHaveLength(0);
    }

    // Écriture d'un client « pour » le tenant B depuis le contexte A : rejetée
    await expect(
      withTenantContext(tenantA.id, null, (tx) =>
        tx.client.create({
          data: {
            tenantId: tenantB.id,
            advisorId: clientB.advisorId,
            firstName: "Injection",
            lastName: "CrossTenant",
            type: "INDIVIDUAL",
          },
        }),
      ),
    ).rejects.toThrow();

    // Le tenant B, lui, voit bien son dossier
    const clientsSeenByB = await withTenantContext(tenantB.id, null, (tx) =>
      tx.client.findMany({ select: { id: true } }),
    );
    expect(clientsSeenByB.map((c) => c.id)).toEqual([clientB.id]);

    // Nettoyage
    await withSystemContext(async (tx) => {
      await tx.tenant.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
      });
    });
  });

  it("les entités plateforme FNAE respectent le capability token (ADR-006)", async () => {
    const suffix = Date.now().toString(36);

    // Préparation : 2 tenants + une analyse publique + leads (plateforme et attribué)
    const { tenantA, tenantB, assessmentId, readToken } =
      await withSystemContext(async (tx) => {
        const tenantA = await tx.tenant.create({
          data: { name: "Tenant FNAE A", slug: `fnae-a-${suffix}` },
        });
        const tenantB = await tx.tenant.create({
          data: { name: "Tenant FNAE B", slug: `fnae-b-${suffix}` },
        });
        const assessment = await tx.assessment.create({
          data: {
            source: "test",
            answers: { age: 40 },
            score: 62,
            categoryScores: { savings: 50 },
            report: { profile: "EN_PROGRESSION" },
            engineVersion: "fnae-1.0",
          },
        });
        // Lead attribué au tenant B
        await tx.lead.create({
          data: {
            tenantId: tenantB.id,
            assessmentId: assessment.id,
            firstName: "Lead",
            lastName: "ChezB",
            email: `lead-b-${suffix}@test.local`,
            consent: true,
            consentAt: new Date(),
            source: "referral",
          },
        });
        return {
          tenantA,
          tenantB,
          assessmentId: assessment.id,
          readToken: assessment.readToken,
        };
      });

    // 1. Public SANS token : aucune analyse lisible
    const seenByAnonymous = await withPublicContext(null, (tx) =>
      tx.assessment.findMany({ select: { id: true } }),
    );
    expect(seenByAnonymous).toHaveLength(0);

    // 2. Public AVEC MAUVAIS token : rien (anti-énumération)
    const seenWithWrongToken = await withPublicContext(
      crypto.randomUUID(),
      (tx) => tx.assessment.findMany({ select: { id: true } }),
    );
    expect(seenWithWrongToken).toHaveLength(0);

    // 3. Public AVEC BON token : son analyse seulement
    const seenWithToken = await withPublicContext(readToken, (tx) =>
      tx.assessment.findMany({ select: { id: true } }),
    );
    expect(seenWithToken.map((a) => a.id)).toEqual([assessmentId]);

    // 4. Public (même avec token) : JAMAIS les leads (PII)
    const leadsSeenPublic = await withPublicContext(readToken, (tx) =>
      tx.lead.findMany({ select: { id: true } }),
    );
    expect(leadsSeenPublic).toHaveLength(0);

    // 5. Insertion publique d'une analyse (tenantless) : permise — le
    //    token est généré par l'app et le GUC posé avant l'insert,
    //    sinon le RETURNING de Prisma échoue sur la politique SELECT
    //    (piège documenté en migration 0007).
    const newToken = crypto.randomUUID();
    const publicInsert = await withPublicContext(newToken, (tx) =>
      tx.assessment.create({
        data: {
          readToken: newToken,
          source: "test-public",
          answers: {},
          score: 10,
          categoryScores: {},
          report: {},
          engineVersion: "fnae-1.0",
        },
      }),
    );
    expect(publicInsert.id).toBeTruthy();

    // 5b. Insertion publique SANS token présenté : rejetée (RETURNING
    //     n'est pas visible pour la politique SELECT).
    await expect(
      withPublicContext(null, (tx) =>
        tx.assessment.create({
          data: {
            source: "test-public-sans-token",
            answers: {},
            score: 1,
            categoryScores: {},
            report: {},
            engineVersion: "fnae-1.0",
          },
        }),
      ),
    ).rejects.toThrow();

    // 6. Leads cross-tenant : A ne voit pas le lead attribué à B
    const leadsSeenByA = await withTenantContext(tenantA.id, null, (tx) =>
      tx.lead.findMany({ select: { id: true } }),
    );
    expect(leadsSeenByA).toHaveLength(0);

    // 7. B voit bien son lead ; les leads plateforme (tenant NULL) restent invisibles
    const leadsSeenByB = await withTenantContext(tenantB.id, null, (tx) =>
      tx.lead.findMany({ select: { id: true } }),
    );
    expect(leadsSeenByB).toHaveLength(1);

    // Nettoyage (leads d'abord — FK ON DELETE RESTRICT)
    await withSystemContext(async (tx) => {
      await tx.lead.deleteMany({
        where: { assessmentId: { in: [assessmentId, publicInsert.id] } },
      });
      await tx.tenant.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
      });
      await tx.assessment.deleteMany({
        where: { id: { in: [assessmentId, publicInsert.id] } },
      });
    });
  });

  it("les données financières granulaires et le FHI sont cloisonnés (Sprint 4)", async () => {
    const suffix = Date.now().toString(36);
    const { tenantA, tenantB, clientB, assessmentB } = await withSystemContext(
      async (tx) => {
        const tenantA = await tx.tenant.create({
          data: { name: "Tenant FHE A", slug: `fhe-a-${suffix}` },
        });
        const tenantB = await tx.tenant.create({
          data: { name: "Tenant FHE B", slug: `fhe-b-${suffix}` },
        });
        const advisorB = await tx.user.create({
          data: {
            email: `advisor-fhe-b-${suffix}@test.local`,
            firstName: "Conseiller",
            lastName: "B",
            passwordHash: "hash-de-test",
          },
        });
        const clientB = await tx.client.create({
          data: {
            tenantId: tenantB.id,
            advisorId: advisorB.id,
            firstName: "Finances",
            lastName: "Invisibles",
            type: "INDIVIDUAL",
          },
        });
        // Profil granulaire du dossier B
        await tx.asset.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, type: "CASH", label: "Liquidités", value: 10_000, registered: false },
        });
        await tx.liability.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, type: "MORTGAGE", label: "Hypothèque", balance: 300_000, monthlyPayment: 1_800 },
        });
        await tx.income.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, label: "Salaire", amount: 90_000, frequency: "ANNUAL", taxable: true },
        });
        await tx.expense.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, category: "HOUSING", amount: 1_700, frequency: "MONTHLY" },
        });
        await tx.insurancePolicy.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, type: "LIFE", coverage: 500_000, premium: 70 },
        });
        await tx.financialGoal.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, name: "Retraite", targetAmount: 1_000_000, priority: "HIGH", status: "ACTIVE" },
        });
        await tx.retirementPlan.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, retirementAge: 65, targetAnnualIncome: 60_000 },
        });
        await tx.financialContext.create({
          data: { tenantId: tenantB.id, clientId: clientB.id, registeredAccountsUsage: "PARTIAL", hasWill: false, beneficiariesStatus: "UNKNOWN" },
        });
        // Snapshot FHI + insight + progression
        const assessmentB = await tx.healthAssessment.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            score: 71,
            categoryScores: { LIQUIDITY: 60 },
            ratios: { savingsRate: 0.1 },
            engineVersion: "fhe-1.0",
            calculatedBy: advisorB.id,
          },
        });
        await tx.healthInsight.create({
          data: {
            tenantId: tenantB.id,
            assessmentId: assessmentB.id,
            type: "RISK",
            category: "LIQUIDITY",
            severity: "MEDIUM",
            message: "Fonds d'urgence sous la cible.",
            recommendation: "Visez 3 à 6 mois de dépenses.",
            aiGenerated: false,
          },
        });
        await tx.healthProgress.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            assessmentId: assessmentB.id,
            previousScore: null,
            newScore: 71,
            changeReason: "Premier calcul (test).",
          },
        });
        await tx.clientPortalLink.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            inviteCodeHash: `hash-test-${suffix}`,
            invitedBy: advisorB.id,
          },
        });
        // Artefact Copilot (Sprint 5)
        await tx.copilotArtifact.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            kind: "SUMMARY",
            content: "## Résumé confidentiel du tenant B",
            provider: "local-composer",
            model: "composer-1.0",
            generatedBy: advisorB.id,
          },
        });
        return { tenantA, tenantB, clientB, assessmentB };
      },
    );

    // Cloisonnement en lecture : le tenant A ne voit RIEN des données FHE de B
    const fheProbes: Array<(tx: DbContext) => Promise<unknown[]>> = [
      (tx) => tx.asset.findMany({ select: { id: true } }),
      (tx) => tx.liability.findMany({ select: { id: true } }),
      (tx) => tx.income.findMany({ select: { id: true } }),
      (tx) => tx.expense.findMany({ select: { id: true } }),
      (tx) => tx.insurancePolicy.findMany({ select: { id: true } }),
      (tx) => tx.financialGoal.findMany({ select: { id: true } }),
      (tx) => tx.retirementPlan.findMany({ select: { id: true } }),
      (tx) => tx.financialContext.findMany({ select: { id: true } }),
      (tx) => tx.healthAssessment.findMany({ select: { id: true } }),
      (tx) => tx.healthInsight.findMany({ select: { id: true } }),
      (tx) => tx.healthProgress.findMany({ select: { id: true } }),
      (tx) => tx.clientPortalLink.findMany({ select: { id: true } }),
      (tx) => tx.copilotArtifact.findMany({ select: { id: true } }),
    ];
    for (const probe of fheProbes) {
      const rows = await withTenantContext(tenantA.id, null, probe);
      expect(rows).toHaveLength(0);
    }

    // Accès direct par identifiant depuis A : refusé
    const crossAssessment = await withTenantContext(tenantA.id, null, (tx) =>
      tx.healthAssessment.findUnique({ where: { id: assessmentB.id } }),
    );
    expect(crossAssessment).toBeNull();

    // Écriture d'un actif « pour » le tenant B depuis le contexte A : rejetée
    await expect(
      withTenantContext(tenantA.id, null, (tx) =>
        tx.asset.create({
          data: {
            tenantId: tenantB.id,
            clientId: clientB.id,
            type: "CASH",
            label: "Injection cross-tenant",
            value: 1,
            registered: false,
          },
        }),
      ),
    ).rejects.toThrow();

    // Le tenant B voit bien son snapshot FHI
    const seenByB = await withTenantContext(tenantB.id, null, (tx) =>
      tx.healthAssessment.findMany({ select: { id: true } }),
    );
    expect(seenByB.map((a) => a.id)).toEqual([assessmentB.id]);

    // Nettoyage
    await withSystemContext(async (tx) => {
      await tx.tenant.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
      });
      await tx.user.deleteMany({
        where: { email: `advisor-fhe-b-${suffix}@test.local` },
      });
    });
  });

  it("le journal d'audit est immuable pour le rôle applicatif", async () => {
    const { tenant } = await withSystemContext(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: "Tenant Audit", slug: `tenant-audit-${Date.now()}` },
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "tenant.created",
          entityType: "Tenant",
          entityId: tenant.id,
        },
      });
      return { tenant };
    });

    await expect(
      withSystemContext((tx) =>
        tx.auditLog.updateMany({
          where: { tenantId: tenant.id },
          data: { action: "tampered" },
        }),
      ),
    ).rejects.toThrow();

    await withSystemContext(async (tx) => {
      // DELETE n'est possible qu'avec un rôle privilégié; nettoyage du tenant
      // ici via le client owner connecté en DIRECT (désactivé en test) — on
      // supprime simplement le tenant si la FK le permet.
      await tx.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    });
  });

  it("marketplace : annuaire opt-in public, contact prouvé par profil listé", async () => {
    const suffix = Date.now().toString(36);
    // Auto-guérison : un run précédent avorté avant son nettoyage laisserait
    // des profils listés parasites dans l'annuaire public.
    await withSystemContext(async (tx) => {
      await tx.tenant.deleteMany({ where: { slug: { startsWith: "mkt-" } } }).catch(() => {});
    });
    const { tenant, listed, hidden } = await withSystemContext(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: "Tenant MKT", slug: `mkt-${suffix}` },
      });
      const advisorListed = await tx.user.create({
        data: {
          email: `mkt-listed-${suffix}@test.local`,
          firstName: "Visible",
          lastName: "Pro",
          passwordHash: "hash-de-test",
        },
      });
      const advisorHidden = await tx.user.create({
        data: {
          email: `mkt-hidden-${suffix}@test.local`,
          firstName: "Invisible",
          lastName: "Pro",
          passwordHash: "hash-de-test",
        },
      });
      const listed = await tx.advisorPublicProfile.create({
        data: {
          tenantId: tenant.id,
          advisorId: advisorListed.id,
          displayName: "Visible Pro",
          bio: "Bio suffisamment longue pour passer la validation minimale.",
          regions: ["Montréal"],
          languages: ["fr"],
          specialties: ["RETIREMENT"],
          isListed: true,
          listedAt: new Date(),
        },
      });
      const hidden = await tx.advisorPublicProfile.create({
        data: {
          tenantId: tenant.id,
          advisorId: advisorHidden.id,
          displayName: "Invisible Pro",
          bio: "Aucun profil public sans opt-in explicite du conseiller.",
          regions: ["Québec"],
          languages: ["fr"],
          specialties: ["PROTECTION"],
          isListed: false,
        },
      });
      return { tenant, listed, hidden };
    });

    // 1. Lecture publique : SEUL le profil listé est visible (opt-in).
    const publicSeen = await withPublicContext(null, (tx) =>
      tx.advisorPublicProfile.findMany({ select: { id: true, isListed: true } }),
    );
    expect(publicSeen.some((p) => p.id === listed.id)).toBe(true);
    expect(publicSeen.some((p) => p.id === hidden.id)).toBe(false);

    // 2. Prise de contact publique sur profil listé : lead + demande créés
    //    (preuve via la GUC app.marketplace_profile — politique 0013).
    const email = `prospect-${suffix}@test.local`;
    // Pattern applicatif (ADR-006 addendum) : uuid côté app + createMany
    // — le RETURNING de `create` exigerait le passage de la politique
    // SELECT, refusée en contexte public par design.
    const leadId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    await withMarketplacePublicContext(listed.id, async (tx) => {
      await tx.lead.createMany({
        data: {
          id: leadId,
          tenantId: tenant.id,
          firstName: "Test",
          lastName: "Prospect",
          email,
          consent: true,
          consentAt: new Date(),
          source: "annuaire",
        },
      });
      await tx.marketplaceContactRequest.createMany({
        data: {
          id: requestId,
          tenantId: tenant.id,
          profileId: listed.id,
          leadId,
          prospectName: "Test Prospect",
          prospectEmail: email,
          message: "Bonjour, je souhaite parler de ma retraite.",
          consent: true,
          consentAt: new Date(),
        },
      });
    });

    // Vérification de la matérialisation côté tenant (pas côté public).
    const proof = await withTenantContext(tenant.id, null, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      const request = await tx.marketplaceContactRequest.findUnique({
        where: { id: requestId },
      });
      return { lead, request };
    });
    expect(proof.lead?.email).toBe(email);
    expect(proof.request?.tenantId).toBe(tenant.id);

    // 3. Lead « annuaire » SANS la preuve (pas de GUC profil) : rejeté.
    await expect(
      withPublicContext(null, (tx) =>
        tx.lead.create({
          data: {
            tenantId: tenant.id,
            firstName: "Sans",
            lastName: "Preuve",
            email: `nope-${suffix}@test.local`,
            consent: true,
            consentAt: new Date(),
            source: "annuaire",
          },
        }),
      ),
    ).rejects.toThrow();

    // 4. La PII des demandes n'est JAMAIS lisible publiquement.
    const publicRequests = await withPublicContext(null, (tx) =>
      tx.marketplaceContactRequest.findMany({ select: { id: true } }),
    );
    expect(publicRequests).toEqual([]);

    // 5. Le tenant propriétaire lit ses demandes ; un autre tenant, non.
    const seenByOwner = await withTenantContext(tenant.id, null, (tx) =>
      tx.marketplaceContactRequest.findMany({ select: { id: true } }),
    );
    expect(seenByOwner.map((r) => r.id)).toContain(requestId);
    const crossTenant = await withTenantContext(listed.id /* mauvais uuid volontairement */, null, (tx) =>
      tx.marketplaceContactRequest.findMany({ select: { id: true } }),
    ).catch(() => []); // uuid profil ≠ uuid tenant → aucune ligne
    expect(crossTenant).toEqual([]);

    // Nettoyage (contexte système, ordre FK)
    await withSystemContext(async (tx) => {
      await tx.marketplaceContactRequest.deleteMany({
        where: { profileId: { in: [listed.id, hidden.id] } },
      });
      await tx.lead.deleteMany({ where: { id: leadId } });
      await tx.advisorPublicProfile.deleteMany({
        where: { id: { in: [listed.id, hidden.id] } },
      });
      await tx.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    });
  });

  it("documents : coffre cloisonné, lien public par capability, enveloppes en machine à états (Sprints 7-7b)", async () => {
    const suffix = Date.now().toString(36);
    // Auto-guérison : un run précédent avorté laisserait ses fixtures.
    await withSystemContext(async (tx) => {
      await tx.tenant
        .deleteMany({ where: { slug: { startsWith: "docs-" } } })
        .catch(() => {});
      await tx.user
        .deleteMany({ where: { email: { startsWith: "docs-" } } })
        .catch(() => {});
    });

    const goodHash = createHash("sha256")
      .update(`jeton-${suffix}`)
      .digest("hex");
    const revokedHash = createHash("sha256")
      .update(`jeton-revoque-${suffix}`)
      .digest("hex");
    const wrongHash = createHash("sha256").update("inconnu").digest("hex");
    // Hachés des jetons capability des signataires EXTERNES (7b).
    const extHash = createHash("sha256")
      .update(`jeton-sign-${suffix}`)
      .digest("hex");
    const extHashB = createHash("sha256")
      .update(`jeton-sign-b-${suffix}`)
      .digest("hex");
    const extWrongHash = createHash("sha256")
      .update("jeton-externe-inconnu")
      .digest("hex");

    const fixtures = await withSystemContext(async (tx) => {
      const tenantA = await tx.tenant.create({
        data: { name: "Tenant Docs A", slug: `docs-a-${suffix}` },
      });
      const tenantB = await tx.tenant.create({
        data: { name: "Tenant Docs B", slug: `docs-b-${suffix}` },
      });
      const advisor = await tx.user.create({
        data: {
          email: `docs-conseiller-${suffix}@test.local`,
          firstName: "Conseiller",
          lastName: "Staff",
          passwordHash: "hash-de-test",
        },
      });
      await tx.tenantUser.create({
        data: { tenantId: tenantA.id, userId: advisor.id, role: "ADVISOR" },
      });
      const portalUser = await tx.user.create({
        data: {
          email: `docs-signataire-${suffix}@test.local`,
          firstName: "Signataire",
          lastName: "Portail",
          passwordHash: "hash-de-test",
        },
      });
      const autrePortail = await tx.user.create({
        data: {
          email: `docs-autre-${suffix}@test.local`,
          firstName: "Autre",
          lastName: "Portail",
          passwordHash: "hash-de-test",
        },
      });
      const clientA = await tx.client.create({
        data: {
          tenantId: tenantA.id,
          advisorId: advisor.id,
          firstName: "Client",
          lastName: "Alpha",
        },
      });
      const clientB = await tx.client.create({
        data: {
          tenantId: tenantB.id,
          advisorId: advisor.id,
          firstName: "Client",
          lastName: "Beta",
        },
      });

      const docA1 = await tx.document.create({
        data: {
          tenantId: tenantA.id,
          clientId: clientA.id,
          uploadedById: advisor.id,
          category: "CONTRAT",
          label: "Mandat A",
          originalFilename: "mandat-a.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "a".repeat(64),
          contentTag: "MDEyMzQ1Njc4OWFiY2RlZg==",
          storageKey: `test/${suffix}/a1.enc`,
        },
      });
      const docA2 = await tx.document.create({
        data: {
          tenantId: tenantA.id,
          clientId: clientA.id,
          uploadedById: advisor.id,
          category: "RAPPORT",
          label: "Copie signée A",
          originalFilename: "copie-a.pdf",
          mimeType: "application/pdf",
          sizeBytes: 120,
          sha256: "b".repeat(64),
          contentTag: "MDEyMzQ1Njc4OWFiY2RlZg==",
          storageKey: `test/${suffix}/a2.enc`,
        },
      });
      const docB = await tx.document.create({
        data: {
          tenantId: tenantB.id,
          clientId: clientB.id,
          uploadedById: advisor.id,
          category: "RELEVE",
          label: "Relevé B — confidentiel",
          originalFilename: "releve-b.pdf",
          mimeType: "application/pdf",
          sizeBytes: 90,
          sha256: "c".repeat(64),
          contentTag: "MDEyMzQ1Njc4OWFiY2RlZg==",
          storageKey: `test/${suffix}/b.enc`,
        },
      });

      const shareA = await tx.documentShare.create({
        data: {
          tenantId: tenantA.id,
          documentId: docA1.id,
          channel: "LINK",
          tokenHash: goodHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          createdById: advisor.id,
        },
      });
      const shareRevoked = await tx.documentShare.create({
        data: {
          tenantId: tenantA.id,
          documentId: docA2.id,
          channel: "LINK",
          tokenHash: revokedHash,
          revokedAt: new Date(),
          createdById: advisor.id,
        },
      });

      // ── Enveloppes (Sprint 7b) : signataires + champs positionnés ──
      const inThirtyDays = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      const envelopeA = await tx.documentSignature.create({
        data: {
          tenantId: tenantA.id,
          documentId: docA1.id,
          signingMode: "SEQUENTIAL",
          requestedById: advisor.id,
          expiresAt: inThirtyDays,
        },
      });
      const signerJean = await tx.signatureSigner.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeA.id,
          kind: "PORTAL_USER",
          userId: portalUser.id,
          email: portalUser.email,
          fullName: "Signataire Portail",
          sortOrder: 0,
        },
      });
      const signerExt = await tx.signatureSigner.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeA.id,
          kind: "EXTERNAL",
          email: `docs-externe-${suffix}@test.local`,
          fullName: "Me Externe",
          sortOrder: 1,
          tokenHash: extHash,
        },
      });
      const signerStaff = await tx.signatureSigner.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeA.id,
          kind: "STAFF",
          userId: advisor.id,
          email: advisor.email,
          fullName: "Conseiller Staff",
          sortOrder: 2,
        },
      });
      const fieldJean = await tx.signatureField.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeA.id,
          signerId: signerJean.id,
          pageIndex: 0,
          kind: "SIGNATURE",
          x: 0.1,
          y: 0.8,
          width: 0.35,
          height: 0.07,
        },
      });
      await tx.signatureField.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeA.id,
          signerId: signerExt.id,
          pageIndex: 0,
          kind: "SIGNATURE",
          x: 0.55,
          y: 0.8,
          width: 0.35,
          height: 0.07,
        },
      });
      await tx.signatureField.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeA.id,
          signerId: signerStaff.id,
          pageIndex: 0,
          kind: "SIGNATURE",
          x: 0.1,
          y: 0.6,
          width: 0.35,
          height: 0.07,
        },
      });

      const envelopeB = await tx.documentSignature.create({
        data: {
          tenantId: tenantA.id,
          documentId: docA2.id,
          signingMode: "PARALLEL",
          requestedById: advisor.id,
          expiresAt: inThirtyDays,
        },
      });
      const signerExtB = await tx.signatureSigner.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeB.id,
          kind: "EXTERNAL",
          email: `docs-notaire-${suffix}@test.local`,
          fullName: "Me Notaire",
          sortOrder: 0,
          tokenHash: extHashB,
        },
      });
      await tx.signatureSigner.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeB.id,
          kind: "STAFF",
          userId: advisor.id,
          email: advisor.email,
          fullName: "Conseiller Staff",
          sortOrder: 1,
        },
      });
      const fieldExtB = await tx.signatureField.create({
        data: {
          tenantId: tenantA.id,
          signatureId: envelopeB.id,
          signerId: signerExtB.id,
          pageIndex: 0,
          kind: "SIGNATURE",
          x: 0.1,
          y: 0.8,
          width: 0.35,
          height: 0.07,
        },
      });

      return {
        tenantA,
        tenantB,
        advisor,
        portalUser,
        autrePortail,
        docA1,
        docA2,
        docB,
        shareA,
        shareRevoked,
        envelopeA,
        envelopeB,
        signerJean,
        signerExt,
        signerStaff,
        signerExtB,
        fieldJean,
        fieldExtB,
      };
    });
    const { tenantA, tenantB, advisor, portalUser, autrePortail } = fixtures;

    // ── 1. Cloisonnement tenant ────────────────────────────────
    const seenByA = await withTenantContext(tenantA.id, advisor.id, (tx) =>
      tx.document.findMany({ select: { id: true } }),
    );
    expect(seenByA.map((d) => d.id).sort()).toEqual(
      [fixtures.docA1.id, fixtures.docA2.id].sort(),
    );

    const crossRead = await withTenantContext(tenantA.id, advisor.id, (tx) =>
      tx.document.findUnique({ where: { id: fixtures.docB.id } }),
    );
    expect(crossRead).toBeNull();

    // Écriture dans un tenant étranger : rejetée (WITH CHECK)
    await expect(
      withTenantContext(tenantA.id, advisor.id, (tx) =>
        tx.document.create({
          data: {
            tenantId: tenantB.id,
            clientId: fixtures.docB.clientId,
            uploadedById: advisor.id,
            category: "AUTRE",
            label: "Injection cross-tenant",
            originalFilename: "x.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1,
            sha256: "d".repeat(64),
            contentTag: "MDEyMzQ1Njc4OWFiY2RlZg==",
            storageKey: `test/${suffix}/x.enc`,
          },
        }),
      ),
    ).rejects.toThrow();

    // Écriture par un NON-staff (utilisateur sans appartenance) : rejetée
    await expect(
      withTenantContext(tenantA.id, portalUser.id, (tx) =>
        tx.document.create({
          data: {
            tenantId: tenantA.id,
            clientId: fixtures.docA1.clientId,
            uploadedById: portalUser.id,
            category: "AUTRE",
            label: "Injection non-staff",
            originalFilename: "y.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1,
            sha256: "e".repeat(64),
            contentTag: "MDEyMzQ1Njc4OWFiY2RlZg==",
            storageKey: `test/${suffix}/y.enc`,
          },
        }),
      ),
    ).rejects.toThrow();

    // Aucun DELETE physique — aucune politique FOR DELETE ⇒ refus total
    await expect(
      withTenantContext(tenantA.id, advisor.id, (tx) =>
        tx.document.delete({ where: { id: fixtures.docA1.id } }),
      ),
    ).rejects.toThrow();

    // ── 2. Lien public par capability token ────────────────────
    const publicDocs = await withDocumentShareContext(goodHash, (tx) =>
      tx.document.findMany({ select: { id: true, label: true } }),
    );
    expect(publicDocs.map((d) => d.id)).toEqual([fixtures.docA1.id]);

    const publicShares = await withDocumentShareContext(goodHash, (tx) =>
      tx.documentShare.findMany({ select: { id: true } }),
    );
    expect(publicShares.map((sh) => sh.id)).toEqual([fixtures.shareA.id]);

    // Mauvais haché : rien. Lien révoqué : rien.
    for (const hash of [wrongHash, revokedHash]) {
      const docs = await withDocumentShareContext(hash, (tx) =>
        tx.document.findMany({ select: { id: true } }),
      );
      expect(docs).toEqual([]);
      const shares = await withDocumentShareContext(hash, (tx) =>
        tx.documentShare.findMany({ select: { id: true } }),
      );
      expect(shares).toEqual([]);
    }

    // Aucune écriture publique (compteur relevé en contexte système
    // par l'application — jamais via le contexte public).
    const publicUpdate = await withDocumentShareContext(goodHash, (tx) =>
      tx.documentShare.updateMany({
        where: { id: fixtures.shareA.id },
        data: { accessCount: 99 },
      }),
    );
    expect(publicUpdate.count).toBe(0);

    // ── 3. Enveloppes : machine à états gravée dans la RLS (7b) ──
    // (a) un AUTRE utilisateur portail ne peut pas signer la ligne de Jean
    const autreSigne = await withTenantContext(
      tenantA.id,
      autrePortail.id,
      (tx) =>
        tx.signatureSigner.updateMany({
          where: { id: fixtures.signerJean.id },
          data: {
            status: "SIGNED",
            signerName: "Imposteur Portail",
            consentText: "consentement",
            signedAt: new Date(),
          },
        }),
    );
    expect(autreSigne.count).toBe(0);

    // (b) l'AGRÉGATION est interdite au signataire : jamais de transition
    //     d'enveloppe (SIGNED/PARTIALLY_SIGNED) par un non-staff.
    const aggregate = await withTenantContext(
      tenantA.id,
      portalUser.id,
      (tx) =>
        tx.documentSignature.updateMany({
          where: { id: fixtures.envelopeA.id },
          data: { status: "PARTIALLY_SIGNED" },
        }),
    );
    expect(aggregate.count).toBe(0);

    // (c) création interdite au non-staff (enveloppe ET ligne signataire)
    await expect(
      withTenantContext(tenantA.id, portalUser.id, (tx) =>
        tx.documentSignature.create({
          data: {
            tenantId: tenantA.id,
            documentId: fixtures.docA1.id,
            requestedById: portalUser.id,
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenantContext(tenantA.id, portalUser.id, (tx) =>
        tx.signatureSigner.create({
          data: {
            tenantId: tenantA.id,
            signatureId: fixtures.envelopeB.id,
            kind: "PORTAL_USER",
            email: "injection@test.local",
            fullName: "Injection Signer",
            sortOrder: 3,
          },
        }),
      ),
    ).rejects.toThrow();

    // (d) tour séquentiel : l'externe (sort 1) ne signe pas avant Jean
    //     (signature_turn_open — fonction SECURITY DEFINER).
    const earlyExternal = await withSignatureTokenContext(extHash, (tx) =>
      tx.signatureSigner.updateMany({
        where: { id: fixtures.signerExt.id },
        data: {
          status: "SIGNED",
          signerName: "Me Externe",
          consentText: "En apposant mon nom ci-dessous, je consens…",
          signedAt: new Date(),
        },
      }),
    );
    expect(earlyExternal.count).toBe(0);

    // (e) SIGNED sans dépôt de preuves complet : refusé (WITH CHECK 42501)
    await expect(
      withTenantContext(tenantA.id, portalUser.id, (tx) =>
        tx.signatureSigner.updateMany({
          where: { id: fixtures.signerJean.id },
          data: { status: "SIGNED", signedAt: new Date() },
        }),
      ),
    ).rejects.toThrow();

    // (f) DECLINED avec motif trop court : refusé (WITH CHECK)
    await expect(
      withTenantContext(tenantA.id, portalUser.id, (tx) =>
        tx.signatureSigner.updateMany({
          where: { id: fixtures.signerJean.id },
          data: { status: "DECLINED", declineReason: "non", declinedAt: new Date() },
        }),
      ),
    ).rejects.toThrow();

    // (g) signature complète avec preuves : PENDING → SIGNED acceptée
    const signed = await withTenantContext(tenantA.id, portalUser.id, (tx) =>
      tx.signatureSigner.updateMany({
        where: { id: fixtures.signerJean.id },
        data: {
          status: "SIGNED",
          signerName: "Signataire Portail",
          initialsText: "SP",
          consentText: "En apposant mon nom ci-dessous, je consens…",
          signedAt: new Date(),
          ipAddress: "127.0.0.1",
          userAgent: "test-rls",
        },
      }),
    );
    expect(signed.count).toBe(1);

    // (h) une ligne SIGNED n'est plus modifiable par le signataire
    //     (USING exige PENDING — la ligne lui échappe : 0 affectée)
    const reTouch = await withTenantContext(tenantA.id, portalUser.id, (tx) =>
      tx.signatureSigner.updateMany({
        where: { id: fixtures.signerJean.id },
        data: { signerName: "Nom Modifié" },
      }),
    );
    expect(reTouch.count).toBe(0);

    // (i) tour désormais ouvert : l'externe signe par capability token
    const extSigned = await withSignatureTokenContext(extHash, (tx) =>
      tx.signatureSigner.updateMany({
        where: { id: fixtures.signerExt.id },
        data: {
          status: "SIGNED",
          signerName: "Me Externe",
          consentText: "En apposant mon nom ci-dessous, je consens…",
          signedAt: new Date(),
          ipAddress: "127.0.0.1",
          userAgent: "test-rls",
        },
      }),
    );
    expect(extSigned.count).toBe(1);

    // (j) mauvais jeton : aucune ligne atteignable
    const wrongExt = await withSignatureTokenContext(extWrongHash, (tx) =>
      tx.signatureSigner.updateMany({
        where: { id: fixtures.signerExt.id },
        data: {
          status: "SIGNED",
          signerName: "Usurpateur",
          consentText: "…",
          signedAt: new Date(),
        },
      }),
    );
    expect(wrongExt.count).toBe(0);

    // (k) périmètre de lecture externe = SA ligne, SON enveloppe,
    //     SES champs, SA pièce — rien d'autre.
    const ownLines = await withSignatureTokenContext(extHashB, (tx) =>
      tx.signatureSigner.findMany({ select: { id: true } }),
    );
    expect(ownLines.map((row) => row.id)).toEqual([fixtures.signerExtB.id]);
    const visibleEnvelopes = await withSignatureTokenContext(extHashB, (tx) =>
      tx.documentSignature.findMany({ select: { id: true } }),
    );
    expect(visibleEnvelopes.map((row) => row.id)).toEqual([
      fixtures.envelopeB.id,
    ]);
    const ownFields = await withSignatureTokenContext(extHashB, (tx) =>
      tx.signatureField.findMany({ select: { id: true } }),
    );
    expect(ownFields.map((row) => row.id)).toEqual([fixtures.fieldExtB.id]);
    const visibleDocs = await withSignatureTokenContext(extHashB, (tx) =>
      tx.document.findMany({ select: { id: true } }),
    );
    expect(visibleDocs.map((row) => row.id)).toEqual([fixtures.docA2.id]);
    const publicTemplates = await withSignatureTokenContext(extHashB, (tx) =>
      tx.signatureTemplate.findMany({ select: { id: true } }),
    );
    expect(publicTemplates).toEqual([]);

    // (l) refus externe motivé : DECLINED + motif + horodatage
    const declined = await withSignatureTokenContext(extHashB, (tx) =>
      tx.signatureSigner.updateMany({
        where: { id: fixtures.signerExtB.id },
        data: {
          status: "DECLINED",
          declineReason: "Document contractuel à revoir avec le conseiller.",
          declinedAt: new Date(),
        },
      }),
    );
    expect(declined.count).toBe(1);

    // (m) le staff garde le cycle de vie complet (annulation d'enveloppe)
    const staffCancel = await withTenantContext(
      tenantA.id,
      advisor.id,
      (tx) =>
        tx.documentSignature.updateMany({
          where: { id: fixtures.envelopeB.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        }),
    );
    expect(staffCancel.count).toBe(1);

    // (n) gabarits : CRUD staff, aucune création par un non-staff
    const template = await withTenantContext(tenantA.id, advisor.id, (tx) =>
      tx.signatureTemplate.create({
        data: {
          tenantId: tenantA.id,
          name: "Gabarit test RLS",
          fields: [],
          createdById: advisor.id,
        },
      }),
    );
    const templatesSeen = await withTenantContext(
      tenantA.id,
      advisor.id,
      (tx) => tx.signatureTemplate.findMany({ select: { id: true } }),
    );
    expect(templatesSeen.map((row) => row.id)).toContain(template.id);
    await expect(
      withTenantContext(tenantA.id, portalUser.id, (tx) =>
        tx.signatureTemplate.create({
          data: {
            tenantId: tenantA.id,
            name: "Gabarit injection",
            fields: [],
            createdById: portalUser.id,
          },
        }),
      ),
    ).rejects.toThrow();
    await withTenantContext(tenantA.id, advisor.id, (tx) =>
      tx.signatureTemplate.delete({ where: { id: template.id } }),
    );

    // (o) aucune suppression de ligne signataire — pas de politique
    //     DELETE : la ligne est introuvable pour la commande (0 affectée).
    const deleteSigner = await withTenantContext(
      tenantA.id,
      advisor.id,
      (tx) =>
        tx.signatureSigner.deleteMany({
          where: { id: fixtures.signerStaff.id },
        }),
    );
    expect(deleteSigner.count).toBe(0);

    // Nettoyage (contexte système : les cascades FK purgent les
    // documents/partages/signatures — aucun DELETE direct n'existe).
    await withSystemContext(async (tx) => {
      await tx.tenant.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
      });
      await tx.user.deleteMany({
        where: {
          id: { in: [advisor.id, portalUser.id, autrePortail.id] },
        },
      });
    });
  });
});

describe.skipIf(!RUN)("Liens inter-clients certifiés (RLS) — Sprint 7c", () => {
  it("staff lit/crée/révoque ; paire ordonnée imposée ; portail et externe exclus", async () => {
    const suffix = Date.now().toString(36);
    const seed = await withSystemContext(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: "Tenant Liens", slug: `liens-${suffix}` },
      });
      const advisor = await tx.user.create({
        data: {
          email: `advisor-liens-${suffix}@test.local`,
          firstName: "Conseiller",
          lastName: "Liens",
          passwordHash: "hash-de-test",
        },
      });
      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: advisor.id, role: "ADVISOR" },
      });
      const portalUser = await tx.user.create({
        data: {
          email: `portal-liens-${suffix}@test.local`,
          firstName: "Particulier",
          lastName: "Portail",
          passwordHash: "hash-de-test",
        },
      });
      // Adhésion CLIENT explicite : même un rôle portail déclaré
      // n'ouvre AUCUNE politique sur les liens (role <> 'CLIENT' exigé).
      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: portalUser.id, role: "CLIENT" },
      });
      const clientA = await tx.client.create({
        data: {
          tenantId: tenant.id,
          advisorId: advisor.id,
          firstName: "Jean",
          lastName: "Un",
          type: "INDIVIDUAL",
        },
      });
      const clientB = await tx.client.create({
        data: {
          tenantId: tenant.id,
          advisorId: advisor.id,
          firstName: "Sophie",
          lastName: "Deux",
          type: "INDIVIDUAL",
        },
      });
      // L'autre tenant pour la preuve de cloisonnement
      const tenantB = await tx.tenant.create({
        data: { name: "Tenant Liens B", slug: `liens-b-${suffix}` },
      });
      const advisorB = await tx.user.create({
        data: {
          email: `advisor-liens-b-${suffix}@test.local`,
          firstName: "Conseiller",
          lastName: "B",
          passwordHash: "hash-de-test",
        },
      });
      await tx.tenantUser.create({
        data: { tenantId: tenantB.id, userId: advisorB.id, role: "ADVISOR" },
      });
      return { tenant, advisor, portalUser, clientA, clientB, tenantB, advisorB };
    });

    // 1. Le MEMBRE DU CABINET crée, lit et révoque (politiques staff).
    const [aId, bId] =
      seed.clientA.id < seed.clientB.id
        ? [seed.clientA.id, seed.clientB.id]
        : [seed.clientB.id, seed.clientA.id];
    const link = await withTenantContext(
      seed.tenant.id,
      seed.advisor.id,
      (tx) =>
        tx.clientLink.create({
          data: {
            tenantId: seed.tenant.id,
            clientIdA: aId,
            clientIdB: bId,
            type: "CONJOINT",
            note: "Couple (test RLS)",
            createdById: seed.advisor.id,
          },
        }),
    );
    const seenByStaff = await withTenantContext(
      seed.tenant.id,
      seed.advisor.id,
      (tx) => tx.clientLink.findMany({ select: { id: true } }),
    );
    expect(seenByStaff.map((row) => row.id)).toEqual([link.id]);

    // 2. Paire ORDONNÉE (a < b) imposée par le CHECK, même hors service.
    await expect(
      withTenantContext(seed.tenant.id, seed.advisor.id, (tx) =>
        tx.clientLink.create({
          data: {
            tenantId: seed.tenant.id,
            clientIdA: bId,
            clientIdB: aId,
            type: "FAMILLE",
            createdById: seed.advisor.id,
          },
        }),
      ),
    ).rejects.toThrow();

    // 3. Un usager PORTAIL (tenant_users CLIENT ou sans rôle staff)
    //    ne voit RIEN et ne peut écrire — aucune politique ne l'admet.
    const seenByPortal = await withTenantContext(
      seed.tenant.id,
      seed.portalUser.id,
      (tx) => tx.clientLink.findMany({ select: { id: true } }),
    );
    expect(seenByPortal).toHaveLength(0);
    await expect(
      withTenantContext(seed.tenant.id, seed.portalUser.id, (tx) =>
        tx.clientLink.create({
          data: {
            tenantId: seed.tenant.id,
            clientIdA: aId,
            clientIdB: bId,
            type: "AUTRE",
            createdById: seed.portalUser.id,
          },
        }),
      ),
    ).rejects.toThrow();

    // 4. Le contexte PUBLIC d'un jeton de signature externe n'y touche pas.
    const extHash = createHash("sha256")
      .update(`liens-externe-${suffix}`)
      .digest("hex");
    const seenByExternal = await withSignatureTokenContext(extHash, (tx) =>
      tx.clientLink.findMany({ select: { id: true } }),
    );
    expect(seenByExternal).toHaveLength(0);

    // 5. Cloisonnement inter-tenant : B ne voit pas le lien de A,
    //    et ne peut pas semer un lien DANS le tenant A.
    const seenByOtherTenant = await withTenantContext(
      seed.tenantB.id,
      seed.advisorB.id,
      (tx) => tx.clientLink.findMany({ select: { id: true } }),
    );
    expect(seenByOtherTenant).toHaveLength(0);
    await expect(
      withTenantContext(seed.tenantB.id, seed.advisorB.id, (tx) =>
        tx.clientLink.create({
          data: {
            tenantId: seed.tenant.id,
            clientIdA: aId,
            clientIdB: bId,
            type: "AUTRE",
            createdById: seed.advisorB.id,
          },
        }),
      ),
    ).rejects.toThrow();

    // 6. Révocation staff : admise (avec audit côté service).
    await withTenantContext(seed.tenant.id, seed.advisor.id, (tx) =>
      tx.clientLink.delete({ where: { id: link.id } }),
    );
    const afterDelete = await withSystemContext((tx) =>
      tx.clientLink.findMany({ where: { id: link.id } }),
    );
    expect(afterDelete).toHaveLength(0);

    // Nettoyage (contexte système — cascade sur les clients/usagers).
    await withSystemContext(async (tx) => {
      await tx.tenant.deleteMany({
        where: { id: { in: [seed.tenant.id, seed.tenantB.id] } },
      });
      await tx.user.deleteMany({
        where: {
          id: { in: [seed.advisor.id, seed.portalUser.id, seed.advisorB.id] },
        },
      });
    });
  });
});

// Évite un vide de suite quand les tests DB sont désactivés.
describe("RLS (intégration)", () => {
  it.skipIf(RUN)("ignorés hors base de données (RUN_DB_TESTS=1 pour activer)", () => {
    expect(true).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// SPRINT 8 — facturation, événements produit, registre sauvegardes
// ═════════════════════════════════════════════════════════════════

describe.skipIf(!RUN)("Monétisation SaaS (RLS PostgreSQL) — Sprint 8", () => {
  async function fixtures() {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    return withSystemContext(async (tx) => {
      const tenantA = await tx.tenant.create({
        data: { name: "Cabinet A8", slug: `cab-a8-${suffix}` },
      });
      const tenantB = await tx.tenant.create({
        data: { name: "Cabinet B8", slug: `cab-b8-${suffix}` },
      });
      const advisorA = await tx.user.create({
        data: {
          email: `adv-a8-${suffix}@test.ca`,
          firstName: "Ada",
          lastName: "A",
          passwordHash: "x",
        },
      });
      await tx.tenantUser.create({
        data: { tenantId: tenantA.id, userId: advisorA.id, role: "ADMIN" },
      });
      const advisorB = await tx.user.create({
        data: {
          email: `adv-b8-${suffix}@test.ca`,
          firstName: "Bob",
          lastName: "B",
          passwordHash: "x",
        },
      });
      await tx.tenantUser.create({
        data: { tenantId: tenantB.id, userId: advisorB.id, role: "ADMIN" },
      });
      // Portail A : AUCUNE adhésion tenant_users (comportement réel) —
      // preuve = lien portail ACTIF sur A.
      const portalA = await tx.user.create({
        data: {
          email: `portail-a8-${suffix}@test.ca`,
          firstName: "Pam",
          lastName: "P",
          passwordHash: "x",
        },
      });
      const clientA = await tx.client.create({
        data: {
          tenantId: tenantA.id,
          advisorId: advisorA.id,
          firstName: "Cli",
          lastName: "A",
        },
      });
      await tx.clientPortalLink.create({
        data: {
          tenantId: tenantA.id,
          clientId: clientA.id,
          userId: portalA.id,
          inviteCodeHash: createHash("sha256").update(`invite-${suffix}`).digest("hex"),
          invitedBy: advisorA.id,
          status: "ACTIVE",
          claimedAt: new Date(),
        },
      });
      const sub = await tx.billingSubscription.create({
        data: {
          tenantId: tenantA.id,
          planCode: "essentiel",
          status: "ACTIVE",
          provider: "SIMULATOR",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 86400000),
        },
      });
      await tx.billingInvoice.create({
        data: {
          tenantId: tenantA.id,
          subscriptionId: sub.id,
          number: `CA-TEST-${suffix}`,
          planCode: "essentiel",
          amountCents: 6784,
          status: "PAID",
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 86400000),
        },
      });
      return { tenantA, tenantB, advisorA, advisorB, portalA, sub };
    });
  }

  it("billing_subscriptions : staff A lit le sien, B ne voit rien, UPDATE croisé refusé", async () => {
    const { tenantA, tenantB, advisorA, advisorB } = await fixtures();
    const own = await withTenantContext(tenantA.id, advisorA.id, (tx) =>
      tx.billingSubscription.findMany(),
    );
    expect(own).toHaveLength(1);
    const other = await withTenantContext(tenantB.id, advisorB.id, (tx) =>
      tx.billingSubscription.findMany(),
    );
    expect(other).toHaveLength(0);
    await expect(
      withTenantContext(tenantB.id, advisorB.id, (tx) =>
        tx.billingSubscription.update({
          where: { tenantId: tenantA.id },
          data: { planCode: "cabinet" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("billing_invoices : staff lit, mais JAMAIS de DELETE (registre append-only)", async () => {
    const { tenantA, tenantB, advisorA, advisorB } = await fixtures();
    const invoices = await withTenantContext(tenantA.id, advisorA.id, (tx) =>
      tx.billingInvoice.findMany(),
    );
    expect(invoices).toHaveLength(1);
    const invoiceId = invoices[0]!.id;
    const asB = await withTenantContext(tenantB.id, advisorB.id, (tx) =>
      tx.billingInvoice.findMany(),
    );
    expect(asB).toHaveLength(0);
    await expect(
      withTenantContext(tenantA.id, advisorA.id, (tx) =>
        tx.billingInvoice.delete({ where: { id: invoiceId } }),
      ),
    ).rejects.toThrow();
  });

  it("product_events : staff insert+select, portail insert PAR PREUVE mais SELECT refusé", async () => {
    const { tenantA, advisorA, portalA } = await fixtures();

    await withTenantContext(tenantA.id, advisorA.id, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "product_events" ("id","tenant_id","app","actor_kind","name")
        VALUES (gen_random_uuid(), ${tenantA.id}::uuid, 'web-advisor', 'STAFF', 'client.created')`;
    });

    // Portail (sans adhésion) : insert autorisé par la preuve lien/session…
    await withTenantContext(tenantA.id, portalA.id, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "product_events" ("id","tenant_id","app","actor_kind","name")
        VALUES (gen_random_uuid(), ${tenantA.id}::uuid, 'web-client', 'PORTAL', 'portal.login')`;
    });

    const events = await withTenantContext(tenantA.id, advisorA.id, (tx) =>
      tx.productEvent.findMany(),
    );
    expect(events).toHaveLength(2);

    // …mais le portail ne RELIT JAMAIS les métriques (SELECT staff only).
    const portalView = await withTenantContext(tenantA.id, portalA.id, (tx) =>
      tx.productEvent.findMany(),
    );
    expect(portalView).toHaveLength(0);

    // Contexte public SANS preuve (aucun GUC capability) : rejeté.
    await expect(
      withPublicContext(null, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "product_events" ("id","tenant_id","app","actor_kind","name")
          VALUES (gen_random_uuid(), ${tenantA.id}::uuid, 'web-marketplace', 'ANONYMOUS', 'assessment.submitted')`;
      }),
    ).rejects.toThrow();

    // UPDATE interdit (registre append-only, REVOKE).
    await expect(
      withTenantContext(tenantA.id, advisorA.id, async (tx) => {
        await tx.$executeRaw`UPDATE "product_events" SET "name" = 'triche'`;
      }),
    ).rejects.toThrow();
  });

  it("backup_runs : registre confiné staff + insert-only", async () => {
    const { tenantA, tenantB, advisorA, advisorB } = await fixtures();
    await withTenantContext(tenantA.id, advisorA.id, (tx) =>
      tx.backupRun.create({
        data: {
          tenantId: tenantA.id,
          trigger: "MANUAL",
          destination: "LOCAL",
          status: "VERIFIED",
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      }),
    );
    const own = await withTenantContext(tenantA.id, advisorA.id, (tx) =>
      tx.backupRun.findMany(),
    );
    expect(own).toHaveLength(1);
    const asB = await withTenantContext(tenantB.id, advisorB.id, (tx) =>
      tx.backupRun.findMany(),
    );
    expect(asB).toHaveLength(0);
    await expect(
      withTenantContext(tenantA.id, advisorA.id, async (tx) => {
        await tx.$executeRaw`DELETE FROM "backup_runs"`;
      }),
    ).rejects.toThrow();
  });
});
