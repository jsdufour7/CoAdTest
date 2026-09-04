/**
 * Captures Sprint 5 — Advisor Intelligence / Copilot (nécessite seed + serveurs).
 * Usage : node scripts/visual-qa-s05.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("docs/screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// 1. Conseiller : fiche 360° avec la carte Copilot
await page.goto("http://localhost:3000/login");
await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL(/\/dashboard/);

await page.goto("http://localhost:3000/clients");
await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
await page.waitForURL(/\/clients\/[0-9a-f-]{36}/);
const clientUrl = page.url();

await page
  .getByRole("heading", { name: "Copilot — résumé du dossier" })
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s05-advisor-fiche360-copilot.png",
  fullPage: true,
});
console.log("✔ s05-advisor-fiche360-copilot.png");

// 2. Page Copilot : générer uniquement les artefacts manquants
await page.goto(`${clientUrl}/copilot`);
for (const label of ["le résumé", "la préparation", "les suggestions", "le bilan"]) {
  const btn = page.getByRole("button", {
    name: `Générer ${label}`,
    exact: true,
  });
  if (await btn.count()) {
    await btn.first().click();
    await page
      .getByText(/Artefact généré avec/)
      .last()
      .waitFor();
  }
}
await page.getByText("composer local (secours)").first().waitFor();
await page.screenshot({
  path: "docs/screenshots/s05-advisor-copilot.png",
  fullPage: true,
});
console.log("✔ s05-advisor-copilot.png");

// 3. Bilan client — version imprimable
await page
  .getByRole("link", { name: "Ouvrir la version imprimable" })
  .click();
await page.waitForURL(/\/copilot\/bilan/);
await page
  .getByRole("heading", { name: "Bilan de santé financière" })
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s05-advisor-copilot-bilan.png",
  fullPage: true,
});
console.log("✔ s05-advisor-copilot-bilan.png");

await browser.close();
