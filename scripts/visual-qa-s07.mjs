/**
 * Captures Sprint 7 — Coffre documentaire & conformité
 * (nécessite pnpm db:seed + pnpm db:seed:demo + serveurs prod :3000-:3002).
 * Usage : node scripts/visual-qa-s07.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("docs/screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// ── 1. Espace conseiller : coffre documentaire du client démo ──────
await page.goto("http://localhost:3000/login");
await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL(/\/dashboard/);

await page.goto("http://localhost:3000/clients");
await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
await page
  .getByRole("link", { name: "Coffre documentaire" })
  .first()
  .click();
await page.waitForURL(/\/documents/);
await page
  .getByText("Mandat de planification financière — à signer")
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s07-advisor-coffre.png",
  fullPage: true,
});
console.log("✔ s07-advisor-coffre.png");

// ── 2. Page Conformité : audit filtré « documents » ────────────────
await page.goto("http://localhost:3000/parametres/conformite");
await page.getByLabel("Action contient").fill("documents");
await page.getByRole("button", { name: "Appliquer" }).click();
await page
  .getByText(/documents\./)
  .first()
  .waitFor();
await page.screenshot({
  path: "docs/screenshots/s07-advisor-conformite.png",
  fullPage: true,
});
console.log("✔ s07-advisor-conformite.png");

// ── 3. Lien public de partage (créé pour l'occasion, révoqué après) ─
await page.goto("http://localhost:3000/clients");
await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
await page
  .getByRole("link", { name: "Coffre documentaire" })
  .first()
  .click();
const bilanRow = page
  .locator("li", { hasText: "Bilan santé financière — " })
  .filter({ hasNotText: "— signé" })
  .first();
await bilanRow.getByText("Partager", { exact: true }).click();
await bilanRow.getByRole("button", { name: "Lien", exact: true }).click();
const urlCode = page.locator("code", { hasText: "/partage/" }).first();
await urlCode.waitFor();
const shareUrl = (await urlCode.textContent())?.trim() ?? "";
const token = shareUrl.match(/\/partage\/([A-Za-z0-9_-]{20,90})/)?.[1] ?? "";

await page.goto(`http://localhost:3002/partage/${token}`);
await page.getByText("Lien vérifié").waitFor();
await page.screenshot({
  path: "docs/screenshots/s07-public-partage.png",
  fullPage: true,
});
console.log("✔ s07-public-partage.png");

// Révocation immédiate — la démo ne laisse aucun lien public actif.
const linkShares = bilanRow.locator("li", { hasText: "Lien (échéance" });
let remaining = await linkShares.count();
while (remaining > 0) {
  await linkShares.first().getByRole("button", { name: "Révoquer" }).click();
  await linkShares.page().waitForTimeout(600);
  remaining = await linkShares.count();
}
console.log("✔ lien de démonstration révoqué");

// ── 4. Portail particulier : documents partagés + signature ────────
await ctx.clearCookies();
await page.goto("http://localhost:3001/login");
await page.getByLabel("Courriel").fill("jean.bouchard@exemple.ca");
await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
await page.getByRole("button", { name: "Se connecter" }).click();
await page.waitForURL(/\/espace/);
await page.getByText("Documents partagés avec vous").scrollIntoViewIfNeeded();
await page.screenshot({
  path: "docs/screenshots/s07-portail-espace-documents.png",
  fullPage: true,
});
console.log("✔ s07-portail-espace-documents.png");

await browser.close();
console.log("✅ Captures Sprint 7 terminées (4 fichiers).");
