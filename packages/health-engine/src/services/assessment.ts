import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import type { HealthActor, RequestMeta } from "../actor";
import { computeFhi } from "../engine";
import type { FhiInput } from "../engine";

/** Listes de valeurs décimales → somme Number (les ratios du moteur
 *  travaillent en Number ; le stockage reste Decimal exact). */
const sum = (values: Array<{ toString(): string } | number | string>) =>
  values.reduce<number>((total, v) => total + Number(v), 0);

const MONTHLY_FACTOR = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  ANNUAL: 1 / 12,
} as const;

const toMonthly = (
  amount: string | number | { toString(): string },
  frequency: string,
) =>
  Number(amount) *
  (MONTHLY_FACTOR[frequency as keyof typeof MONTHLY_FACTOR] ?? 1);

/**
 * Calcule l'indice de santé financière (FR-FHE-001/002).
 * Produit un snapshot IMMUABLE (assessment + insights + progression) —
 * jamais de mise à jour : chaque calcul ajoute une ligne d'historique
 * (Règle 3 — évolution préservée), + timeline + audit.
 */
export async function calculateFhi(
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    // 1. Assemblage du snapshot d'entrée du moteur
    const client = await tx.client.findFirst({
      where: { id: clientId },
      include: {
        familyMembers: { select: { role: true } },
        assets: true,
        liabilities: true,
        incomes: true,
        expenses: true,
        insurancePolicies: true,
        financialGoals: { where: { status: "ACTIVE" } },
        retirementPlan: true,
        financialContext: true,
      },
    });
    if (!client) {
      throw new ValidationError("Ce dossier client est introuvable.");
    }

    const age = client.birthDate
      ? Math.floor(
          (Date.now() - client.birthDate.getTime()) /
            (365.25 * 86_400_000),
        )
      : null;
    const dependents = client.familyMembers.filter((m) =>
      ["CHILD", "DEPENDENT", "SPOUSE"].includes(m.role),
    ).length;
    const consumerDebt = sum(
      client.liabilities
        .filter((l) => ["CREDIT_CARD", "LINE_OF_CREDIT"].includes(l.type))
        .map((l) => l.balance),
    );
    const goalsTarget = sum(client.financialGoals.map((g) => g.targetAmount));
    const mobilizable =
      sum(client.assets.filter((a) => a.type === "CASH").map((a) => a.value)) +
      sum(
        client.assets
          .filter((a) => a.type === "INVESTMENT")
          .map((a) => a.value),
      );

    const input: FhiInput = {
      age,
      dependents,
      annualIncome:
        client.incomes.reduce(
          (total, i) => total + Number(i.amount) * (MONTHLY_FACTOR[i.frequency] ?? 1) * 12,
          0,
        ) || 0,
      monthlyExpenses: client.expenses
        .filter((e) => e.category !== "SAVINGS")
        .reduce((total, e) => total + toMonthly(e.amount, e.frequency), 0),
      monthlySavings: client.expenses
        .filter((e) => e.category === "SAVINGS")
        .reduce((total, e) => total + toMonthly(e.amount, e.frequency), 0),
      monthlyDebtPayments: sum(
        client.liabilities.map((l) => l.monthlyPayment),
      ),
      consumerDebt,
      totalDebt: sum(client.liabilities.map((l) => l.balance)),
      liquidAssets: sum(
        client.assets.filter((a) => a.type === "CASH").map((a) => a.value),
      ),
      investedAssets: sum(
        client.assets
          .filter((a) => a.type === "INVESTMENT")
          .map((a) => a.value),
      ),
      registeredAssets: sum(
        client.assets.filter((a) => a.registered).map((a) => a.value),
      ),
      realEstate: sum(
        client.assets
          .filter((a) => a.type === "REAL_ESTATE")
          .map((a) => a.value),
      ),
      otherAssets: sum(
        client.assets
          .filter((a) => ["BUSINESS", "OTHER"].includes(a.type))
          .map((a) => a.value),
      ),
      lifeCoverage: sum(
        client.insurancePolicies
          .filter((p) => p.type === "LIFE")
          .map((p) => p.coverage),
      ),
      hasDisabilityInsurance: client.insurancePolicies.some(
        (p) => p.type === "DISABILITY",
      ),
      retirementAge: client.retirementPlan?.retirementAge ?? null,
      targetRetirementIncome: client.retirementPlan
        ? Number(client.retirementPlan.targetAnnualIncome)
        : null,
      registeredAccountsUsage:
        client.financialContext?.registeredAccountsUsage ?? "UNKNOWN",
      hasWill: client.financialContext?.hasWill ?? false,
      beneficiariesStatus:
        client.financialContext?.beneficiariesStatus ?? "UNKNOWN",
      activeGoalsCount: client.financialGoals.length,
      goalsFundedRatio: goalsTarget > 0 ? mobilizable / goalsTarget : 0,
    };

    if (input.annualIncome <= 0) {
      throw new ValidationError(
        "Ajoutez au moins un revenu au profil financier avant de calculer l'indice FHI.",
      );
    }

    // 2. Calcul déterministe
    const result = computeFhi(input);

    // 3. Snapshot précédent (progression)
    const previous = await tx.healthAssessment.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: { id: true, score: true, engineVersion: true },
    });

    // 4. Persistance IMMUABLE du nouveau snapshot
    const assessment = await tx.healthAssessment.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        score: result.score,
        categoryScores: result.categoryScores,
        ratios: result.ratios,
        engineVersion: result.engineVersion,
        calculatedBy: actor.userId,
      },
    });

    await tx.healthInsight.createMany({
      data: result.insights.map((insight) => ({
        tenantId: actor.tenantId,
        assessmentId: assessment.id,
        type: insight.type,
        category: insight.category,
        severity: insight.severity,
        message: insight.message,
        recommendation: insight.recommendation ?? null,
        aiGenerated: false,
      })),
    });

    await tx.healthProgress.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        assessmentId: assessment.id,
        previousScore: previous?.score ?? null,
        newScore: result.score,
        delta: previous ? result.score - previous.score : null,
        changeReason: previous
          ? "Recalcul après mise à jour du profil financier."
          : "Premier calcul de l'indice de santé financière.",
      },
    });

    // 5. Timeline Financial Life OS (historique visible au conseiller)
    const deltaText = previous
      ? result.score >= previous.score
        ? ` (+${result.score - previous.score} pts)`
        : ` (${result.score - previous.score} pts)`
      : "";
    await tx.timelineEvent.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        eventType: "FINANCIAL_EVENT",
        title: `Indice de santé financière calculé : ${result.score}/100${deltaText}`,
        source: "SYSTEM",
        createdBy: actor.userId,
      },
    });

    // 6. Audit (données sensibles)
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "fhi.calculated",
      entityType: "HealthAssessment",
      entityId: assessment.id,
      newData: {
        clientId,
        score: result.score,
        previousScore: previous?.score ?? null,
        engineVersion: result.engineVersion,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return assessment;
  });
}

/**
 * Tableau santé financière d'un client : dernier snapshot + insights +
 * historique (progression). Permission `clients:read`.
 */
export async function getHealthDashboard(
  actor: HealthActor,
  clientId: string,
) {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const latest = await tx.healthAssessment.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: {
        insights: { orderBy: [{ severity: "desc" }, { createdAt: "asc" }] },
        progress: true,
      },
    });
    const history = await tx.healthAssessment.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        score: true,
        engineVersion: true,
        createdAt: true,
        progress: { select: { delta: true, changeReason: true } },
      },
    });
    return { latest, history };
  });
}
