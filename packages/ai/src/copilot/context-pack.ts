import { withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import type { CopilotContextPack } from "./contract";

/**
 * Assemble le paquet de données structurées du Copilot (Règle Dev :
 * « données structurées + contexte + historique »). Lecture confinée
 * au tenant par la RLS. Tout reste côté serveur — jamais exposé tel
 * quel au navigateur.
 */

const MONTHLY_FACTOR: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  ANNUAL: 1 / 12,
};

const ROLE_LABELS: Record<string, string> = {
  SPOUSE: "Conjoint·e",
  CHILD: "Enfant",
  PARENT: "Parent",
  DEPENDENT: "Personne à charge",
  OTHER: "Autre",
};

const TIMELINE_LABELS: Record<string, string> = {
  LIFE_EVENT: "Événement de vie",
  FINANCIAL_EVENT: "Financier",
  MEETING: "Rencontre",
  COMPLIANCE: "Conformité",
  DOCUMENT: "Document",
  GOAL: "Objectif",
};

const toMonthly = (amount: { toString(): string } | number, frequency: string) =>
  Number(amount) * (MONTHLY_FACTOR[frequency] ?? 1);

export async function loadContextPack(
  tenantId: string,
  userId: string,
  clientId: string,
): Promise<CopilotContextPack> {
  return withTenantContext(tenantId, userId, async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId },
      include: {
        tenant: { select: { name: true } },
        familyMembers: {
          select: { firstName: true, lastName: true, role: true },
          orderBy: { createdAt: "asc" },
        },
        incomes: { select: { amount: true, frequency: true } },
        expenses: { select: { amount: true, frequency: true, category: true } },
        assets: { select: { value: true, type: true } },
        liabilities: {
          select: { balance: true, monthlyPayment: true, type: true },
        },
        insurancePolicies: { select: { id: true } },
        financialGoals: {
          where: { status: "ACTIVE" },
          select: {
            name: true,
            targetAmount: true,
            targetDate: true,
            priority: true,
          },
          orderBy: { priority: "desc" },
          take: 8,
        },
        retirementPlan: {
          select: { retirementAge: true, targetAnnualIncome: true },
        },
        financialContext: {
          select: {
            registeredAccountsUsage: true,
            hasWill: true,
            beneficiariesStatus: true,
          },
        },
        healthAssessments: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            score: true,
            engineVersion: true,
            createdAt: true,
            categoryScores: true,
            insights: {
              select: { type: true, category: true, message: true },
            },
          },
        },
        tasks: {
          where: { status: { in: ["TODO", "IN_PROGRESS"] } },
          select: { title: true, dueDate: true, priority: true },
          orderBy: { dueDate: "asc" },
          take: 8,
        },
        timelineEvents: {
          orderBy: { eventDate: "desc" },
          take: 5,
          select: { eventDate: true, eventType: true, title: true },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            createdAt: true,
            content: true,
            author: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!client) {
      throw new ValidationError("Ce dossier client est introuvable.");
    }

    const now = new Date();
    const age = client.birthDate
      ? Math.floor(
          (now.getTime() - client.birthDate.getTime()) / (365.25 * 86_400_000),
        )
      : null;

    const hasFinance =
      client.incomes.length > 0 ||
      client.expenses.length > 0 ||
      client.assets.length > 0 ||
      client.liabilities.length > 0;

    const annualIncome = client.incomes.reduce(
      (t, i) => t + toMonthly(i.amount, i.frequency) * 12,
      0,
    );
    const monthlyExpenses = client.expenses
      .filter((e) => e.category !== "SAVINGS")
      .reduce((t, e) => t + toMonthly(e.amount, e.frequency), 0);
    const monthlySavings = client.expenses
      .filter((e) => e.category === "SAVINGS")
      .reduce((t, e) => t + toMonthly(e.amount, e.frequency), 0);
    const monthlyDebtPayments = client.liabilities.reduce(
      (t, l) => t + Number(l.monthlyPayment),
      0,
    );
    const totalAssets = client.assets.reduce((t, a) => t + Number(a.value), 0);
    const totalDebts = client.liabilities.reduce(
      (t, l) => t + Number(l.balance),
      0,
    );
    const liquidAssets = client.assets
      .filter((a) => a.type === "CASH")
      .reduce((t, a) => t + Number(a.value), 0);
    const monthlyOutflow = monthlyExpenses + monthlyDebtPayments;

    const latest = client.healthAssessments[0] ?? null;
    const previous = client.healthAssessments[1] ?? null;

    return {
      tenant: { name: client.tenant.name },
      client: {
        firstName: client.firstName,
        lastName: client.lastName,
        type: client.type,
        status: client.status,
        age,
        email: client.email,
        phone: client.phone,
        createdAt: client.createdAt.toISOString(),
      },
      household: client.familyMembers.map((m) => ({
        name: `${m.firstName} ${m.lastName}`,
        roleLabel: ROLE_LABELS[m.role] ?? m.role,
      })),
      finance: hasFinance
        ? {
            annualIncome,
            monthlyExpenses,
            monthlySavings,
            monthlyDebtPayments,
            totalAssets,
            totalDebts,
            netWorth: totalAssets - totalDebts,
            liquidMonths:
              monthlyOutflow > 0 ? liquidAssets / monthlyOutflow : null,
            savingsRate:
              annualIncome > 0 ? (monthlySavings * 12) / annualIncome : null,
            counts: {
              incomes: client.incomes.length,
              expenses: client.expenses.length,
              assets: client.assets.length,
              liabilities: client.liabilities.length,
              insurances: client.insurancePolicies.length,
              goals: client.financialGoals.length,
            },
            retirement: client.retirementPlan
              ? {
                  age: client.retirementPlan.retirementAge,
                  targetAnnualIncome: Number(
                    client.retirementPlan.targetAnnualIncome,
                  ),
                }
              : null,
            registeredAccountsUsage:
              client.financialContext?.registeredAccountsUsage ?? "UNKNOWN",
            hasWill: client.financialContext?.hasWill ?? false,
            beneficiariesStatus:
              client.financialContext?.beneficiariesStatus ?? "UNKNOWN",
          }
        : null,
      health: latest
        ? {
            score: latest.score,
            engineVersion: latest.engineVersion,
            calculatedAt: latest.createdAt.toISOString(),
            categoryScores:
              (latest.categoryScores as Record<string, number>) ?? {},
            strengths: latest.insights
              .filter((i) => i.type === "STRENGTH")
              .map((i) => i.message)
              .slice(0, 4),
            risks: latest.insights
              .filter((i) => i.type === "RISK")
              .map((i) => i.message)
              .slice(0, 4),
            topActions: latest.insights
              .filter((i) => i.type === "ACTION" || i.type === "OPPORTUNITY")
              .map((i) => i.message)
              .slice(0, 4),
            deltaSincePrevious: previous
              ? latest.score - previous.score
              : null,
          }
        : null,
      goals: client.financialGoals.map((g) => ({
        name: g.name,
        targetAmount: Number(g.targetAmount),
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        priority: g.priority,
      })),
      openTasks: client.tasks.map((t) => ({
        title: t.title,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        priority: t.priority,
        overdue: t.dueDate ? t.dueDate.getTime() < now.getTime() : false,
      })),
      recentTimeline: client.timelineEvents.map((e) => ({
        date: e.eventDate.toISOString(),
        typeLabel: TIMELINE_LABELS[e.eventType] ?? e.eventType,
        title: e.title,
      })),
      recentNotes: client.notes.map((n) => ({
        date: n.createdAt.toISOString(),
        authorName: `${n.author.firstName} ${n.author.lastName}`,
        excerpt:
          n.content.length > 200 ? `${n.content.slice(0, 200)}…` : n.content,
      })),
      generatedAt: now.toISOString(),
    };
  });
}
