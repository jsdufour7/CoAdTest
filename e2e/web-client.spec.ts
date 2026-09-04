import { expect, test } from "@playwright/test";

import { minimalPdf } from "./fixtures";

const ADVISOR = "http://localhost:3000";
const PORTAL = "http://localhost:3001";

/**
 * Critère de succès Sprint 4 (côté particulier) : « le client comprend
 * sa santé financière » — boucle complète invitation → consentement →
 * tableau de bord FHI en lecture seule.
 *
 * S'appuie sur le jeu de données démo (pnpm db:seed) : le profil
 * financier de Jean Bouchard permet un calcul FHI immédiat.
 */
test.describe("Sprint 4 — Portail particulier (boucle complète)", () => {
  test("invitation conseiller → liaison consentie → FHI visible et explicable", async ({
    page,
    context,
  }) => {
    // ── 1. Conseiller (web-advisor :3000) — compte démo seedé ─────
    await page.goto(`${ADVISOR}/login`);
    await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Fiche du client démo Jean Bouchard
    await page.goto(`${ADVISOR}/clients`);
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);

    // Santé financière : (re)calcul du FHI sur le profil seedé
    await page.getByRole("link", { name: "Santé financière" }).first().click();
    await page
      .getByRole("button", { name: /(Calculer|Recalculer) l'indice/ })
      .click();
    await expect(page.getByText(/FHI \d+\/100/).first()).toBeVisible();

    // Invitation portail → le code s'affiche UNE seule fois
    await page
      .getByRole("button", { name: "Générer un code d'invitation" })
      .click();
    const codeElement = page.locator("code");
    await expect(codeElement).toBeVisible();
    const inviteCode = (await codeElement.textContent())?.trim() ?? "";
    expect(inviteCode).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);

    // ── 2. Particulier (web-client :3001) — nouveau compte ────────
    //    Les deux apps partagent le nom de cookie sur localhost :
    //    on efface la session conseiller avant de changer d'identité.
    await context.clearCookies();

    const id = Date.now().toString(36);
    await page.goto(`${PORTAL}/inscription`);
    await page.getByLabel("Prénom").fill("Jean");
    await page.getByLabel("Nom", { exact: true }).fill("Bouchard");
    await page.getByLabel("Courriel").fill(`jean-portail-${id}@exemple.ca`);
    await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    // Après inscription : session ouverte, étape liaison
    await expect(page).toHaveURL(/\/lier/);

    // Sans consentement explicite : refus (Loi 25)
    await page.locator("#code").fill(inviteCode);
    // La case est requise par le HTML — on valide le garde-fou serveur
    // en soumettant via JS (bypass du required natif).
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.noValidate = true;
    });
    await page.getByRole("button", { name: "Lier mon dossier" }).click();
    await expect(page.getByText(/consentement explicite est requis/i)).toBeVisible();

    // Avec consentement coché : liaison réussie
    // (React 19 réinitialise les champs non contrôlés après chaque soumission
    //  de <form action> — on ressaisit le code.)
    await page.locator("#code").fill(inviteCode);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Lier mon dossier" }).click();
    await expect(page).toHaveURL(/\/espace/);

    // ── 3. Le client voit et comprend sa santé financière ─────────
    await expect(
      page.getByRole("heading", { name: /Votre santé financière est/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Vos 10 aspects financiers" }),
    ).toBeVisible();
    await expect(page.getByText("Liquidités").first()).toBeVisible();
    await expect(page.getByText("Retraite").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Comprendre votre score" }),
    ).toBeVisible();
    await expect(page.getByText(/Préparé avec Cabinet Démo/i)).toBeVisible();

    // Réutilisation du même code : refusée (déjà revendiqué)
    await page.goto(`${PORTAL}/lier`);
    await page.locator("#code").fill(inviteCode);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Lier mon dossier" }).click();
    await expect(page.getByText(/déjà lié à un dossier|invalide/i)).toBeVisible();
  });

  test("un compte non lié voit l'état vide avec l'appel à l'action", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    const id = Date.now().toString(36);

    await page.goto(`${PORTAL}/inscription`);
    await page.getByLabel("Prénom").fill("Solo");
    await page.getByLabel("Nom", { exact: true }).fill("Visiteur");
    await page.getByLabel("Courriel").fill(`solo-${id}@exemple.ca`);
    await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/lier/);

    await page.goto(`${PORTAL}/espace`);
    await expect(
      page.getByText(/Liez votre dossier pour voir votre santé financière/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Lier mon dossier" }),
    ).toBeVisible();

    // /lier exige une session : testé implicitement par le parcours ci-dessus.
  });
});

/**
 * Critère de succès Sprint 7 (côté particulier) : le client voit les
 * documents partagés par son conseiller dans « Mon espace », et signe
 * électroniquement un document par nom tapé + consentement horodaté —
 * la copie signée avec certificat est ensuite partagée des deux côtés.
 *
 * Boucle complète autosuffisante : liaison portail (invitation + claim)
 * rétablie D'ABORD pour le compte seedé — le test Sprint 4 l'ayant fait
 * revendiquer par un compte jetable, et la demande de signature résolvant
 * le signataire au moment de sa création.
 */
test.describe("Sprint 7 — Portail : documents partagés & signature", () => {

  async function loginAdvisor(page: import("@playwright/test").Page) {
    await page.goto(`${ADVISOR}/login`);
    await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  async function loginPortal(page: import("@playwright/test").Page) {
    await page.goto(`${PORTAL}/login`);
    await page.getByLabel("Courriel").fill("jean.bouchard@exemple.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/espace/);
  }

  async function openVault(page: import("@playwright/test").Page) {
    await page.goto(`${ADVISOR}/clients`);
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await page
      .getByRole("link", { name: "Coffre documentaire" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/documents/);
  }

  test("liaison → partages visibles → demande → signature portail → copie certifiée", async ({
    page,
    context,
  }) => {
    const id = Date.now().toString(36);
    const label = `Convention de services ${id}`;

    // ── 1. Conseiller : dépôt PDF + code d'invitation frais ──────
    await loginAdvisor(page);
    await openVault(page);

    await page.getByLabel("Libellé affiché").fill(label);
    await page.locator("#category").selectOption("CONTRAT");
    await page.locator("#vault-file").setInputFiles({
      name: `convention-${id}.pdf`,
      mimeType: "application/pdf",
      buffer: minimalPdf,
    });
    await page.getByRole("button", { name: "Déposer au coffre" }).click();
    await expect(
      page.getByText(new RegExp(`« ${label} » déposé au coffre`)),
    ).toBeVisible();

    // Code d'invitation (santé financière) — affiché UNE seule fois
    const clientUrl = page.url().replace(/\/documents$/, "");
    await page.goto(`${clientUrl}/sante`);
    await page
      .getByRole("button", { name: "Générer un code d'invitation" })
      .click();
    const codeElement = page.locator("code");
    await expect(codeElement.first()).toBeVisible();
    const inviteCode =
      (await codeElement.first().textContent())?.trim() ?? "";
    expect(inviteCode).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);

    // ── 2. Particulier : revendication → lien ACTIVE rétabli ─────
    await context.clearCookies();
    await loginPortal(page);
    await page.goto(`${PORTAL}/lier`);
    await page.locator("#code").fill(inviteCode);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Lier mon dossier" }).click();
    await expect(page).toHaveURL(/\/espace/);

    // Documents partagés visibles (seed démo)
    await expect(
      page.getByText("Documents partagés avec vous"),
    ).toBeVisible();
    await expect(
      page.getByText("Relevé REER — Banque Démo (spécimen)"),
    ).toBeVisible();

    // Le téléchargement portail déchiffre côté serveur (preuve : texte)
    const releveRow = page.locator("li", {
      hasText: "Relevé REER — Banque Démo (spécimen)",
    });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      releveRow.getByRole("link", { name: "Ouvrir" }).click(),
    ]);
    const fs = await import("node:fs/promises");
    const body = await fs.readFile(await download.path(), "utf8");
    expect(body).toContain("RELEVE REER — BANQUE DEMO");

    // ── 3. Conseiller : enveloppe 7b (signataire unique = Jean) ───
    //      L'enveloppe résout le signataire via son lien portail
    //      ACTIVE, d'où l'ordre imposé par la liaison du point 2.
    await context.clearCookies();
    await loginAdvisor(page);
    await openVault(page);
    const row = page.locator("li", { hasText: label });
    await row.getByText("Signature", { exact: true }).click();
    await row.getByTestId("open-envelope-wizard").click();
    const wizard = row.getByTestId("envelope-wizard");
    await expect(wizard).toBeVisible();
    await wizard
      .getByLabel("Choisir un compte portail")
      .selectOption({ label: "Jean Bouchard" });
    await wizard
      .getByLabel("Choisir un compte portail")
      .locator("xpath=..")
      .getByRole("button", { name: "Ajouter" })
      .click();
    await expect(wizard.getByTestId("pdf-page-1")).toBeVisible({
      timeout: 20000,
    });
    await wizard.getByTestId("preset-signature-bottom").click();
    await expect(wizard.getByTestId("field-chip")).toHaveCount(1);
    await wizard.getByTestId("wizard-submit").click();
    await expect(
      page.getByText(/Enveloppe envoyée à 1 signataire/),
    ).toBeVisible({ timeout: 15000 });

    // ── 4. Particulier : « Ouvrir et signer » — le processus se fait
    //       EN DIRECT dans le document (Sprint 7c) : visionneuse temps
    //       réel, adoption façon DocuSign, validation.
    await context.clearCookies();
    await loginPortal(page);
    const pendingCard = page.locator("li", { hasText: label });
    await expect(pendingCard).toContainText(/Zones prévues à votre nom/);
    await pendingCard.getByTestId("portal-open-sign").click();
    await expect(page).toHaveURL(/\/espace\/enveloppe\/[0-9a-f-]{36}$/);

    // La pièce s'affiche À L'ÉCRAN — pas de « télécharger puis signer ».
    await expect(page.getByTestId("signing-viewer")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId("signing-field-signature")).toBeVisible();
    await expect(
      page.getByText(/En apposant mon nom ci-dessous/),
    ).toBeVisible();

    // Adoption façon DocuSign : nom tapé pré-rempli + style script,
    // aperçu vivant DANS la zone avant de valider.
    await page.getByTestId("signing-field-signature").click();
    await expect(page.getByTestId("adopt-signature-dialog")).toBeVisible();
    await expect(page.getByTestId("adopt-name")).toHaveValue("Jean Bouchard");
    await page.getByTestId("adopt-style-sacramento").click();
    await page.getByTestId("adopt-submit").click();
    await expect(page.getByTestId("portal-adopted-ok")).toBeVisible();

    await page.getByTestId("portal-sign-submit").click();

    // ── 5. Signataire unique → ronde close : la pièce finale (avec
    //       certificat) se TÉLÉCHARGE immédiatement, ici même.
    await expect(page.getByTestId("portal-signed-final")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(/le document final \(avec certificat\) peut être téléchargé/),
    ).toBeVisible();
    const [finalDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("portal-download-after-sign").click(),
    ]);
    const fsFinal = await import("node:fs/promises");
    const finalBytes = await fsFinal.readFile(await finalDownload.path());
    expect(finalBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Pièce estampillée + certificat de preuve : taille réelle d'un
    // PDF multi-pages (le spécimen source tient en ~600 octets).
    expect(finalBytes.length).toBeGreaterThan(2000);

    // La demande a quitté la file d'attente du portail.
    await page.goto(`${PORTAL}/espace`);
    await expect(
      page.locator("li", { hasText: label }).getByTestId("portal-open-sign"),
    ).toHaveCount(0);
  });

  test("refus motivé : ronde close, copie constatant le refus et « nouvel envoi » (7c)", async ({
    page,
    context,
  }) => {
    const id = Date.now().toString(36);
    const label = `Clause à refuser ${id}`;

    // ── 1. Conseiller : dépôt + enveloppe (Jean seul) ────────────
    await loginAdvisor(page);
    await openVault(page);
    await page.getByLabel("Libellé affiché").fill(label);
    await page.locator("#category").selectOption("CONTRAT");
    await page.locator("#vault-file").setInputFiles({
      name: `clause-${id}.pdf`,
      mimeType: "application/pdf",
      buffer: minimalPdf,
    });
    await page.getByRole("button", { name: "Déposer au coffre" }).click();
    await expect(
      page.getByText(new RegExp(`« ${label} » déposé au coffre`)),
    ).toBeVisible();

    const row = page.locator("li", { hasText: label });
    await row.getByText("Signature", { exact: true }).click();
    await row.getByTestId("open-envelope-wizard").click();
    const wizard = row.getByTestId("envelope-wizard");
    await wizard
      .getByLabel("Choisir un compte portail")
      .selectOption({ label: "Jean Bouchard" });
    await wizard
      .getByLabel("Choisir un compte portail")
      .locator("xpath=..")
      .getByRole("button", { name: "Ajouter" })
      .click();
    await expect(wizard.getByTestId("pdf-page-1")).toBeVisible({
      timeout: 20000,
    });
    await wizard.getByTestId("preset-signature-bottom").click();
    await wizard.getByTestId("wizard-submit").click();
    await expect(
      page.getByText(/Enveloppe envoyée à 1 signataire/),
    ).toBeVisible({ timeout: 15000 });

    // ── 2. Particulier : refus motivé DEPUIS la vue document (7c) ──
    await context.clearCookies();
    await loginPortal(page);
    await page.locator("li", { hasText: label }).getByTestId("portal-open-sign").click();
    await expect(page).toHaveURL(/\/espace\/enveloppe\//);
    await expect(page.getByTestId("signing-viewer")).toBeVisible({
      timeout: 20000,
    });
    await page.getByTestId("portal-decline-toggle").click();
    await page
      .getByTestId("portal-decline-reason")
      .fill("Cette clause ne correspond pas à notre discussion du 15 juillet.");
    await page.getByTestId("portal-decline-submit").click();
    await expect(page.getByTestId("portal-signed-final")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(/Refus enregistré — votre conseiller a été avisé/),
    ).toBeVisible();

    // Même sur refus, la ronde est TERMINÉE : la pièce constatant le
    // refus (avec certificat) est téléchargeable par le signataire.
    const [refusDl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("portal-download-after-sign").click(),
    ]);
    const fsRefus = await import("node:fs/promises");
    const refusBytes = await fsRefus.readFile(await refusDl.path());
    expect(refusBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // ── 3. Conseiller : badge « Refusée », motif, copie constatante ──
    //    (la copie close porte le MÊME libellé au coffre, par design 7c —
    //    on cible donc la ligne qui porte le badge d'enveloppe.)
    await context.clearCookies();
    await loginAdvisor(page);
    await openVault(page);
    const declinedRow = page
      .locator("li", { hasText: label })
      .filter({ has: page.locator("[data-testid='envelope-badge']") });
    await expect(declinedRow.getByTestId("envelope-badge")).toHaveText(
      /Refusée/,
    );
    await expect(declinedRow).toContainText("notre discussion du 15 juillet");
    await expect(declinedRow).toContainText("constatant le refus");

    // ── 4. « Nouvel envoi » : on relance SANS tout reconfigurer ────
    await declinedRow.getByTestId(/^resend-/).click();
    await expect(
      page.getByText(/Nouvel envoi reparti/),
    ).toBeVisible({ timeout: 15000 });
    await expect(declinedRow.getByTestId("envelope-badge")).toHaveText(
      /En attente/,
    );
  });
});
