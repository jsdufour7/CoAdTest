import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Critères de succès Sprint 8 — Commercialisation SaaS :
 * paliers tarifaires + quotas vivants, paiement (simulateur Stripe),
 * factures TPS/TVQ en PDF, analytics first-party débloquées par palier,
 * sauvegarde opérateur vérifiée, photo marketplace servie du coffre.
 *
 * La spec tourne en série : la montée Essentiel → Pro est un prérequis
 * des vérifications analytics, puis on REDESCEND en Essentiel pour
 * laisser la démo dans son état semé (et prouver la porte des quotas
 * dans les deux sens).
 */

const ADVISOR = "http://localhost:3000";
const MARKETPLACE = "http://localhost:3002";

async function loginDemo(page: Page): Promise<void> {
  await page.goto(`${ADVISOR}/login`);
  await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
  await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("Sprint 8 — Monétisation SaaS (cabinet démo)", () => {
  test("palier Essentiel : jauges d'usage, grille 4 paliers, factures PDF et upsell analytics", async ({
    page,
  }) => {
    await loginDemo(page);

    await page.goto(`${ADVISOR}/abonnement`);
    await expect(page.getByTestId("plan-courant")).toContainText(
      "Palier Essentiel",
    );
    await expect(page.getByTestId("badge-simulateur")).toBeVisible();

    // Jauges d'usage vivantes (quota ≠ affichage statique)
    await expect(page.getByTestId("jauge-clients")).toContainText("/ 100");
    await expect(page.getByTestId("jauge-coffre")).toContainText("Go");
    await expect(page.getByTestId("jauge-enveloppes")).toContainText("/ 50");
    await expect(page.getByTestId("jauge-sieges")).toContainText("2 / 2");

    // Grille tarifaire fondateur : 0 / 59 / 119 / 199 CAD
    await expect(page.getByTestId("plan-decouverte")).toContainText("0 $");
    await expect(page.getByTestId("plan-essentiel")).toContainText("59");
    await expect(page.getByTestId("plan-pro")).toContainText("119");
    await expect(page.getByTestId("plan-cabinet")).toContainText("199");
    await expect(page.getByTestId("cta-essentiel")).toBeDisabled();

    // Factures semées (CA-2026-0001/0002 — 59 $ + TPS 5 % + TVQ 9,975 %)
    await expect(page.getByTestId("factures")).toContainText("CA-2026-0001");
    await expect(page.getByTestId("factures")).toContainText("67,84");
    const pdfHref = await page
      .getByTestId("invoice-pdf-CA-2026-0002")
      .getAttribute("href");
    expect(pdfHref).toBeTruthy();
    const pdf = await page.request.get(`${ADVISOR}${pdfHref}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    const pdfBody = await pdf.body();
    expect(pdfBody.length).toBeGreaterThan(1000);
    expect(pdfBody.subarray(0, 5).toString()).toBe("%PDF-");

    // Analytics verrouillées au palier Essentiel → panneau d'upsell,
    // mais vue plateforme visible (cabinet opérateur, rôle ADMIN).
    await page.goto(`${ADVISOR}/analytics`);
    await expect(page.getByTestId("analytics-upsell")).toBeVisible();
    await expect(page.getByTestId("upsell-cta")).toBeVisible();
    await expect(page.getByTestId("analytics-plateforme")).toContainText(
      "59",
    );
  });

  test("montée Essentiel → Pro via le simulateur Stripe (carte 4242, facture TPS/TVQ)", async ({
    page,
  }) => {
    await loginDemo(page);

    await page.goto(`${ADVISOR}/abonnement`);
    await page.getByTestId("cta-pro").click();
    await expect(page).toHaveURL(/\/abonnement\/checkout\?.*plan=pro/);

    // Page « hébergée » du simulateur : total 119 $ + taxes avant saisie
    await expect(page.getByTestId("checkout-simulateur")).toBeVisible();
    await expect(page.getByTestId("checkout-total")).toContainText("136,82");

    // Carte non-test refusée d'abord (verrou fonctionnel du simulateur)
    await page.getByLabel("Nom sur la carte").fill("Marie Tremblay");
    await page
      .getByLabel("Numéro de carte (test)")
      .fill("5555 5555 5555 4444");
    await page.getByLabel("Expiration (MM/AA)").fill("12/30");
    await page.getByLabel("CVC").fill("123");
    await page.getByTestId("pay-sim-submit").click();
    await expect(
      page.getByTestId("form-checkout-sim").getByRole("alert"),
    ).toContainText("uniquement les cartes de test débutant par 4242");

    // Vraie carte de test Stripe — le refresh RSC post-échec a vidé les
    // champs non contrôlés : on re-saisit le formulaire au complet.
    await page.getByLabel("Nom sur la carte").fill("Marie Tremblay");
    await page
      .getByLabel("Numéro de carte (test)")
      .fill("4242 4242 4242 4242");
    await page.getByLabel("Expiration (MM/AA)").fill("12/30");
    await page.getByLabel("CVC").fill("123");
    await page.getByTestId("pay-sim-submit").click();

    await expect(page).toHaveURL(/\/abonnement\?checkout=succes/);
    await expect(page.getByTestId("banner-checkout-succes")).toBeVisible();
    await expect(page.getByTestId("plan-courant")).toContainText("Palier Pro");

    // Plafonds Pro : clients et enveloppes illimités, sièges 2/3
    await expect(page.getByTestId("jauge-clients")).toContainText("∞");
    await expect(page.getByTestId("jauge-enveloppes")).toContainText("∞");
    await expect(page.getByTestId("jauge-sieges")).toContainText("2 / 3");

    // Nouvelle facture Pro : 119 $ + TPS + TVQ = 136,82 $, PDF régénéré
    const proInvoice = page
      .locator('[data-testid^="invoice-CA-2026-"]', { hasText: "Palier Pro" })
      .first();
    await expect(proInvoice).toContainText("136,82");
    const proPdfHref = await proInvoice
      .locator('a[data-testid^="invoice-pdf-"]')
      .getAttribute("href");
    const proPdf = await page.request.get(`${ADVISOR}${proPdfHref}`);
    expect(proPdf.status()).toBe(200);
    expect(proPdf.headers()["content-type"]).toContain("application/pdf");
  });

  test("analytics débloquées au palier Pro : KPIs, série, entonnoir, vue plateforme", async ({
    page,
  }) => {
    await loginDemo(page);

    await page.goto(`${ADVISOR}/analytics`);
    await expect(page.getByTestId("analytics-upsell")).toHaveCount(0);
    await expect(page.getByText("Événements (30 j)").first()).toBeVisible();
    await expect(page.getByTestId("analytics-serie")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Série quotidienne" }).first(),
    ).toBeVisible();

    // Entonnoir semé : envois / signatures / refus sur 30 jours
    const funnel = page.getByTestId("analytics-entonnoir");
    await expect(funnel).toContainText("Enveloppes envoyées");
    await expect(funnel).toContainText("Taux de complétion");
    await expect(page.getByTestId("analytics-top")).toBeVisible();

    // La ventilation par membre reste un privilège du palier Cabinet
    await expect(page.getByTestId("analytics-equipe")).toContainText(
      "Palier Cabinet",
    );

    // Vue plateforme (équipe fondatrice) : MRR passé à 119 $ (Pro)
    await expect(page.getByTestId("analytics-plateforme")).toContainText(
      "119",
    );
    await expect(page.getByTestId("analytics-plateforme")).toContainText(
      /Pro · 1/,
    );
  });

  test("sauvegarde manuelle opérateur : cycle vérifié de bout en bout", async ({
    page,
  }) => {
    await loginDemo(page);

    await page.goto(`${ADVISOR}/parametres/sauvegardes`);
    await expect(page.getByTestId("etat-s3")).toBeVisible();
    const verifiedBefore = await page
      .locator('[data-testid="run-verified"]')
      .count();
    expect(verifiedBefore).toBeGreaterThanOrEqual(1);

    await page.getByTestId("run-backup").click();
    await expect(page).toHaveURL(/\/parametres\/sauvegardes\?ran=ok/);
    await expect(page.getByTestId("banner-backup-ok")).toBeVisible();
    await expect(page.locator('[data-testid="run-verified"]')).toHaveCount(
      verifiedBefore + 1,
    );
  });

  test("retour au palier Essentiel : descente immédiate sans facture, analytics reverrouillées", async ({
    page,
  }) => {
    await loginDemo(page);

    await page.goto(`${ADVISOR}/abonnement`);
    await page.getByTestId("cta-essentiel").click();
    await expect(page).toHaveURL(/\/abonnement\?plan_change=/);
    await expect(page.getByTestId("plan-courant")).toContainText(
      "Palier Essentiel",
    );

    // La porte des quotas se referme : upsell analytics à nouveau visible
    await page.goto(`${ADVISOR}/analytics`);
    await expect(page.getByTestId("analytics-upsell")).toBeVisible();
  });
});

test.describe("Sprint 8 — Marketplace (photo hors du code, dans le coffre)", () => {
  test.use({ baseURL: MARKETPLACE });

  test("la photo d'un profil listé est servie depuis le coffre chiffré", async ({
    page,
  }) => {
    await page.goto("/conseillers");

    // La carte de Marie Tremblay affiche la photo issue du coffre
    const photo = page.getByAltText("Photo de Marie Tremblay");
    await expect(photo).toBeVisible();
    const src = await photo.getAttribute("src");
    expect(src).toMatch(/\/conseillers\/[0-9a-f-]{36}\/photo/);

    // Route publique : 200, PNG, cache CDN — zéro fuite du stockage
    const response = await page.request.get(src!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(response.headers()["cache-control"]).toContain("public");
    const body = await response.body();
    expect(body.length).toBeGreaterThan(5000);
    // Signature PNG
    expect(body.subarray(1, 4).toString()).toBe("PNG");

    // La fiche conseiller affiche la même photo
    const marieCard = photo.locator(
      "xpath=ancestor::div[.//a[contains(normalize-space(.),'Voir le profil')]][1]",
    );
    await marieCard.getByRole("link", { name: "Voir le profil" }).click();
    await expect(page).toHaveURL(/\/conseillers\/[0-9a-f-]{36}/);
    await expect(
      page.getByAltText("Photo de Marie Tremblay"),
    ).toBeVisible();
  });
});
