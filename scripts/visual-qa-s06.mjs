/**
 * Captures Sprint 6 — Marketplace (nécessite seed + serveurs prod sur :3000-:3002).
 * Usage : node scripts/visual-qa-s06.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const MARIE_PROFILE_ID = "2ca4b070-1bae-4a23-a6e9-d190e8b3d0c2";
const ASSESSMENT_ID = "f63ad57f-9b44-4b4a-b7d4-04ff302c6fe8";
const ASSESSMENT_TOKEN = "62e05399-f8aa-4425-8c1c-f7e26eb2a4e7";

await mkdir("docs/screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// 1. Annuaire public — conseillers listés (opt-in) avec filtres
await page.goto("http://localhost:3002/conseillers");
await page.getByRole("heading", { name: /Trouver un conseiller/i }).waitFor();
await page.screenshot({
  path: "docs/screenshots/s06-marketplace-annuaire.png",
  fullPage: true,
});
console.log("✔ s06-marketplace-annuaire.png");

// 2. Profil public d'un conseiller — avis « déclaratif non vérifié » + formulaire
await page.goto(`http://localhost:3002/conseillers/${MARIE_PROFILE_ID}`);
await page
  .getByRole("heading", { name: "Marie Tremblay", exact: true })
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s06-marketplace-profil-conseiller.png",
  fullPage: true,
});
console.log("✔ s06-marketplace-profil-conseiller.png");

// 3. Portrait FNAE — section « Conseillers recommandés » (matching déterministe)
await page.goto(
  `http://localhost:3002/portrait/${ASSESSMENT_ID}?k=${ASSESSMENT_TOKEN}`,
);
await page
  .getByRole("heading", { name: "Conseillers recommandés pour votre profil" })
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s06-portrait-recommandations.png",
  fullPage: true,
});
console.log("✔ s06-portrait-recommandations.png");

// 4. Espace conseiller — « Mon profil public » (formulaire + interrupteur opt-in)
await page.goto("http://localhost:3000/login");
await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL(/\/dashboard/);

await page.goto("http://localhost:3000/parametres/profil-public");
await page
  .getByRole("heading", { name: /profil public/i })
  .first()
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s06-advisor-profil-public.png",
  fullPage: true,
});
console.log("✔ s06-advisor-profil-public.png");

// 5. Boîte leads — source « Annuaire public » (boucle prospect → conseiller)
await page.goto("http://localhost:3000/leads");
await page.getByText("Annuaire public").first().waitFor();
await page.screenshot({
  path: "docs/screenshots/s06-advisor-leads-annuaire.png",
  fullPage: true,
});
console.log("✔ s06-advisor-leads-annuaire.png");

await browser.close();
