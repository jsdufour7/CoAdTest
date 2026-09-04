/**
 * Captures d'écran de contrôle visuel (pages publiques, sans DB).
 * Usage : node scripts/visual-qa.mjs   (serveurs déjà démarrés)
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = [
  {
    url: "http://localhost:3000/login",
    file: "docs/screenshots/advisor-login.png",
  },
  {
    url: "http://localhost:3000/signup",
    file: "docs/screenshots/advisor-signup.png",
  },
  {
    url: "http://localhost:3002/",
    file: "docs/screenshots/marketplace-landing.png",
    fullPage: true,
  },
  {
    url: "http://localhost:3002/analyse",
    file: "docs/screenshots/marketplace-analyse.png",
  },
];

await mkdir("docs/screenshots", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const shot of SHOTS) {
  await page.goto(shot.url, { waitUntil: "networkidle" });
  await page.screenshot({ path: shot.file, fullPage: shot.fullPage ?? false });
  console.log(`✔ ${shot.file}`);
}

await browser.close();
