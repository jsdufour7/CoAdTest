/**
 * Captures Sprint 4 — Financial Health Engine (nécessite seed + serveurs).
 * Usage : node scripts/visual-qa-s04.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("docs/screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// 1. Conseiller : fiche santé financière du client démo
await page.goto("http://localhost:3000/login");
await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL(/\/dashboard/);

await page.goto("http://localhost:3000/clients");
await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
await page.waitForURL(/\/clients\/[0-9a-f-]{36}/);
const clientUrl = page.url();

// S'assurer qu'un FHI existe
await page.goto(`${clientUrl}/sante`);
const calcButton = page.getByRole("button", {
  name: /(Calculer|Recalculer) l'indice/,
});
if (await calcButton.count()) {
  await calcButton.first().click();
  await page.getByText(/FHI \d+\/100/).first().waitFor();
}
await page.screenshot({
  path: "docs/screenshots/s04-advisor-sante-fhi.png",
  fullPage: true,
});
console.log("✔ s04-advisor-sante-fhi.png");

await page.goto(`${clientUrl}/finances`);
await page
  .getByRole("heading", { name: "Revenus" })
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s04-advisor-finances.png",
  fullPage: true,
});
console.log("✔ s04-advisor-finances.png");

// 2. Portail particulier : invitation → liaison → tableau de bord
await page.goto(`${clientUrl}/sante`);
await page
  .getByRole("button", { name: "Générer un code d'invitation" })
  .click();
const code = (await page.locator("code").textContent())?.trim() ?? "";
console.log(`  code d'invitation: ${code}`);

await ctx.clearCookies();
const id = Date.now().toString(36);
await page.goto("http://localhost:3001/inscription");
await page.getByLabel("Prénom").fill("Camille");
await page.getByLabel("Nom", { exact: true }).fill("Demo");
await page.getByLabel("Courriel").fill(`camille-${id}@exemple.ca`);
await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
await page.getByRole("button", { name: "Créer mon compte" }).click();
await page.waitForURL(/\/lier/);
await page.screenshot({ path: "docs/screenshots/s04-portail-lier.png" });
console.log("✔ s04-portail-lier.png");

await page.locator("#code").fill(code);
await page.getByRole("checkbox").check();
await page.getByRole("button", { name: "Lier mon dossier" }).click();
await page.waitForURL(/\/espace/);
await page
  .getByRole("heading", { name: /Votre santé financière est/ })
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s04-portail-espace-fhi.png",
  fullPage: true,
});
console.log("✔ s04-portail-espace-fhi.png");

await browser.close();
