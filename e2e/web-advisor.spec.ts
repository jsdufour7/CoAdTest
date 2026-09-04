import { expect, test } from "@playwright/test";

import { minimalPdf } from "./fixtures";

/**
 * Critère de succès Sprint 1 : un cabinet peut créer son environnement sécurisé.
 */
test.describe("Sprint 1 — Core Platform", () => {
  test("un cabinet peut créer son espace sécurisé (signup → dashboard)", async ({
    page,
  }) => {
    const id = Date.now().toString(36);

    await page.goto("/signup");
    await page.getByLabel("Nom du cabinet").fill(`Cabinet ${id}`);
    await page.getByLabel("Prénom").fill("Marie");
    await page.getByLabel("Nom", { exact: true }).fill("Tremblay");
    await page.getByLabel("Courriel").fill(`marie-${id}@exemple.ca`);
    await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
    await page.getByRole("button", { name: "Créer mon espace" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /tableau de bord/i }),
    ).toBeVisible();
  });

  test("un visiteur non authentifié est redirigé vers /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

/**
 * Critère de succès Sprint 2 : un conseiller peut gérer un dossier client.
 */
test.describe("Sprint 2 — Fondation CRM", () => {
  test("un conseiller crée un client et enrichit son dossier", async ({
    page,
  }) => {
    const id = Date.now().toString(36);

    // Création du cabinet (compte conseiller ADMIN)
    await page.goto("/signup");
    await page.getByLabel("Nom du cabinet").fill(`Cabinet CRM ${id}`);
    await page.getByLabel("Prénom").fill("Marie");
    await page.getByLabel("Nom", { exact: true }).fill("Tremblay");
    await page.getByLabel("Courriel").fill(`crm-${id}@exemple.ca`);
    await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
    await page.getByRole("button", { name: "Créer mon espace" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Création du dossier client
    await page.goto("/clients/nouveau");
    await page.getByLabel("Prénom").fill("Jean");
    await page.getByLabel("Nom", { exact: true }).fill("Bouchard");
    await page.getByLabel("Type de client").selectOption("FAMILY");
    await page.getByLabel("Courriel").fill("jean.bouchard@exemple.ca");
    await page.getByRole("button", { name: "Créer le dossier" }).click();

    // Fiche client 360° affichée
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
    await expect(
      page.getByRole("heading", { name: "Jean Bouchard" }).first(),
    ).toBeVisible();
    await expect(page.getByText("Dossier client créé")).toBeVisible();

    // Ajout d'une note (journal audité)
    await page.getByLabel("Type de note").selectOption("MEETING");
    await page
      .getByLabel("Contenu")
      .fill("Rencontre découverte — objectifs retraite confirmés.");
    await page.getByRole("button", { name: "Ajouter la note" }).click();
    await expect(
      page.getByText("Rencontre découverte — objectifs retraite confirmés."),
    ).toBeVisible();

    // Ajout d'une tâche de suivi
    await page
      .getByLabel("Titre")
      .fill("Obtenir les relevés REER");
    await page.getByLabel("Priorité").selectOption("HIGH");
    await page.getByRole("button", { name: "Ajouter la tâche" }).click();
    await expect(page.getByText("Obtenir les relevés REER")).toBeVisible();

    // Ajout d'un membre de l'entourage
    await page.getByLabel("Prénom").fill("Sophie");
    await page.getByLabel("Nom", { exact: true }).fill("Bouchard");
    await page.getByLabel("Lien").selectOption("SPOUSE");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText("Sophie Bouchard").first()).toBeVisible();

    // La liste des clients reflète le nouveau dossier
    await page.goto("/clients");
    await expect(page.getByText("Jean Bouchard")).toBeVisible();
  });

  test("la boîte leads est protégée et vide au départ", async ({ page }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login/);

    const id = Date.now().toString(36);
    await page.goto("/signup");
    await page.getByLabel("Nom du cabinet").fill(`Cabinet Leads ${id}`);
    await page.getByLabel("Prénom").fill("Marie");
    await page.getByLabel("Nom", { exact: true }).fill("Tremblay");
    await page.getByLabel("Courriel").fill(`leads-${id}@exemple.ca`);
    await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
    await page.getByRole("button", { name: "Créer mon espace" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/leads");
    await expect(page.getByText("Aucun lead pour le moment")).toBeVisible();
  });

  test("la recherche filtre la liste des clients", async ({ page }) => {
    const id = Date.now().toString(36);

    await page.goto("/signup");
    await page.getByLabel("Nom du cabinet").fill(`Cabinet Rech ${id}`);
    await page.getByLabel("Prénom").fill("Marie");
    await page.getByLabel("Nom", { exact: true }).fill("Tremblay");
    await page.getByLabel("Courriel").fill(`rech-${id}@exemple.ca`);
    await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
    await page.getByRole("button", { name: "Créer mon espace" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/clients/nouveau");
    await page.getByLabel("Prénom").fill("Paul");
    await page.getByLabel("Nom", { exact: true }).fill("Lavallée");
    await page.getByRole("button", { name: "Créer le dossier" }).click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);

    await page.goto("/clients");
    await page.getByPlaceholder(/rechercher/i).fill("Lavallée");
    await page.getByRole("button", { name: /rechercher/i }).click();
    await expect(page.getByText("Paul Lavallée")).toBeVisible();

    await page.getByPlaceholder(/rechercher/i).fill("Inconnu");
    await page.getByRole("button", { name: /rechercher/i }).click();
    await expect(page.getByText("Paul Lavallée")).toBeHidden();
  });
});

/**
 * Critère de succès Sprint 4 (côté conseiller) : le profil financier
 * granulaire alimente un FHI explicable, calculé par le moteur déterministe.
 */
test.describe("Sprint 4 — Financial Health Engine (conseiller)", () => {
  test("saisie granulaire → calcul FHI → catégories + explications + historique", async ({
    page,
  }) => {
    const id = Date.now().toString(36);

    // Cabinet + compte conseiller
    await page.goto("/signup");
    await page.getByLabel("Nom du cabinet").fill(`Cabinet FHI ${id}`);
    await page.getByLabel("Prénom").fill("Marie");
    await page.getByLabel("Nom", { exact: true }).fill("Tremblay");
    await page.getByLabel("Courriel").fill(`fhi-${id}@exemple.ca`);
    await page.getByLabel("Mot de passe").fill("Str0ng!Passw0rd2026");
    await page.getByRole("button", { name: "Créer mon espace" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Dossier client frais
    await page.goto("/clients/nouveau");
    await page.getByLabel("Prénom").fill("Lucie");
    await page.getByLabel("Nom", { exact: true }).fill("Gagnon");
    await page.getByRole("button", { name: "Créer le dossier" }).click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
    const clientUrl = page.url();

    // Sans revenu : le calcul est refusé avec un message clair
    await page.goto(`${clientUrl}/sante`);
    await page
      .getByRole("button", { name: "Calculer l'indice FHI" })
      .click();
    await expect(
      page.getByText(/Ajoutez au moins un revenu/i),
    ).toBeVisible();

    // Saisie granulaire : un revenu + un actif + une dette
    await page.goto(`${clientUrl}/finances`);
    await expect(
      page.getByRole("heading", { name: "Revenus" }),
    ).toBeVisible();

    await page.locator("#income-label").fill("Salaire — Emploi");
    await page.locator("#income-amount").fill("90000");
    await page.locator("#income-frequency").selectOption("ANNUAL");
    await page.getByRole("button", { name: "Ajouter le revenu" }).click();
    await expect(page.getByText("Revenu ajouté.")).toBeVisible();

    await page.locator("#asset-label").fill("Liquidités — compte chèque");
    await page.locator("#asset-value").fill("18000");
    await page.getByRole("button", { name: "Ajouter l'actif" }).click();
    await expect(page.getByText("Actif ajouté.")).toBeVisible();

    await page.locator("#liability-label").fill("Carte de crédit");
    await page.locator("#liability-type").selectOption("CREDIT_CARD");
    await page.locator("#liability-balance").fill("3500");
    await page.locator("#liability-payment").fill("150");
    await page.getByRole("button", { name: "Ajouter la dette" }).click();
    await expect(page.getByText("Dette ajoutée.")).toBeVisible();

    // La synthèse reflète la saisie
    await expect(page.getByText("90 000").first()).toBeVisible();

    // Calcul du premier FHI
    await page.goto(`${clientUrl}/sante`);
    await page
      .getByRole("button", { name: "Calculer l'indice FHI" })
      .click();
    await expect(page.getByText(/FHI \d+\/100/).first()).toBeVisible();

    // Les 10 catégories pondérées sont affichées
    await expect(
      page.getByRole("heading", { name: "Les 10 catégories" }),
    ).toBeVisible();
    await expect(page.getByText("Liquidités").first()).toBeVisible();
    await expect(page.getByText("Retraite").first()).toBeVisible();

    // Explications FR-FHE-002 (facteurs + pistes)
    await expect(
      page.getByRole("heading", { name: "Comprendre le score" }),
    ).toBeVisible();

    // Historique : premier snapshot immuable
    await expect(
      page.getByRole("heading", { name: "Historique de l'indice" }),
    ).toBeVisible();
    await expect(page.getByText("Premier calcul")).toBeVisible();

    // Recalcul → historique préservé avec variation (Règle 3)
    await page
      .getByRole("button", { name: "Recalculer l'indice" })
      .click();
    await expect(
      page.getByText(/Recalcul après mise à jour/i).first(),
    ).toBeVisible();

    // Le badge FHI remonte sur la fiche 360°
    await page.goto(clientUrl);
    await expect(page.getByText(/FHI \d+\/100/).first()).toBeVisible();
  });
});

/**
 * Critère de succès Sprint 5 (conseiller) : « le conseiller économise
 * du temps » — résumé instantané, préparation de rencontre, suggestions
 * actionnables et bilan client générés par le Copilot (composer local
 * en l'absence de passerelle ; le bridge est validé en tests unitaires
 * avec une fausse API compatible OpenAI).
 */
test.describe("Sprint 5 — Advisor Intelligence (Copilot)", () => {
  test("résumé, préparation journalisée, suggestions actionnables, bilan imprimable", async ({
    page,
  }) => {
    // Compte démo : dossier Jean Bouchard riche (finances + FHI + tâches)
    await page.goto("/login");
    await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/clients");
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
    const clientUrl = page.url();

    // La fiche 360 expose la carte Copilot
    await expect(
      page.getByRole("heading", { name: "Copilot — résumé du dossier" }),
    ).toBeVisible();

    // Page Copilot
    await page.getByRole("link", { name: "Copilot" }).first().click();
    await expect(page).toHaveURL(/\/copilot/);
    await expect(
      page.getByText("composer local (secours)").first(),
    ).toBeVisible();

    // Vérification de connexion : passerelle non configurée en démo
    await page
      .getByRole("button", { name: "Tester la passerelle" })
      .click();
    await expect(page.getByText(/non configurée/i)).toBeVisible();

    // 1. Résumé de dossier
    await page
      .getByRole("button", { name: /(Générer|Régénérer) le résumé/ })
      .click();
    await expect(
      page.getByText(/Artefact généré avec/).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Résumé du dossier — Jean Bouchard" }),
    ).toBeVisible();
    await expect(page.getByText(/avoir net/i).first()).toBeVisible();

    // 2. Préparation de rencontre → sauvegarde au journal
    await page
      .getByRole("button", { name: /(Générer|Régénérer) la préparation/ })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Préparation de rencontre — Jean Bouchard",
      }),
    ).toBeVisible();
    await expect(page.getByText("Ordre du jour suggéré")).toBeVisible();
    // Ancre déterministe : le 2e avis « Artefact généré avec » prouve que
    // la nouvelle préparation (et l'identifiant lié au formulaire) est
    // effectivement rendue — sans cette attente, on risquait de
    // journaliser la version précédente (STALE_ARTIFACT).
    await expect(page.getByText(/Artefact généré avec/)).toHaveCount(2);
    await page
      .getByRole("button", { name: /Sauvegarder au journal/ })
      .click();
    await expect(
      page.getByText("Préparation sauvegardée au journal"),
    ).toBeVisible();

    // 3. Suggestions → création d'une tâche en 1 clic
    await page
      .getByRole("button", { name: /(Générer|Régénérer) les suggestions/ })
      .click();
    await expect(page.getByText(/Artefact généré avec/)).toHaveCount(3);
    await page
      .getByRole("button", { name: "Créer une tâche" })
      .first()
      .click();
    await expect(
      page.getByText("Tâche créée dans le dossier"),
    ).toBeVisible();

    // 4. Bilan client → version imprimable
    await page
      .getByRole("button", { name: /(Générer|Régénérer) le bilan/ })
      .click();
    await expect(page.getByText(/Artefact généré avec/)).toHaveCount(4);
    // Le nouveau bilan est rendu → le lien pointe vers la version fraîche.
    await page
      .getByRole("link", { name: "Ouvrir la version imprimable" })
      .click();
    await expect(page).toHaveURL(/\/copilot\/bilan/);
    await expect(
      page.getByRole("heading", { name: "Bilan de santé financière" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Imprimer / PDF" }),
    ).toBeVisible();
    await expect(
      // La mention apparaît dans le contenu Markdown rendu ET dans le
      // pied de page de provenance → .first() pour le mode strict.
      page.getByText(/ne constitue pas un avis financier réglementé/i).first(),
    ).toBeVisible();

    // Historique des artefacts (4 types générés)
    await page.goto(`${clientUrl}/copilot`);
    await expect(
      page.getByRole("heading", { name: "Historique du Copilot" }),
    ).toBeVisible();
    await expect(
      page.getByText("Préparation rencontre").first(),
    ).toBeVisible();

    // La note de préparation et la tâche remontent sur la fiche 360°
    await page.goto(clientUrl);
    await expect(
      page.getByText(/Préparation de rencontre — générée par le Copilot/).first(),
    ).toBeVisible();
  });
});

/**
 * Critère de succès Sprint 7 (côté conseiller) : un coffre documentaire
 * chiffré opérationnel — dépôt, génération de rapports PDF serveur,
 * partage au portail — et une page Conformité (audit filtrable
 * exportable CSV + export complet des données d'un client, Loi 25).
 * S'appuie sur le jeu démo (pnpm db:seed + pnpm db:seed:demo).
 */
test.describe("Sprint 7 — Coffre documentaire & conformité", () => {

  async function loginAdvisor(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  async function openVault(page: import("@playwright/test").Page) {
    await page.goto("/clients");
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
    await page
      .getByRole("link", { name: "Coffre documentaire" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}\/documents/);
    await expect(
      page.getByRole("heading", { name: /Coffre documentaire/ }),
    ).toBeVisible();
  }

  test("coffre : pièces démo listées, dépôt chiffré, rapport PDF, partage portail", async ({
    page,
  }) => {
    const id = Date.now().toString(36);
    await loginAdvisor(page);
    await openVault(page);

    // 1. Les pièces démo (seed) sont là : relevé, mandat (libellé PROPRE —
    //    le statut vit dans les badges depuis le 7b), entente, bilan FHI.
    await expect(
      page.getByText("Relevé REER — Banque Démo (spécimen)"),
    ).toBeVisible();
    await expect(
      page.getByText("Mandat de planification financière", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Entente de services-conseils (spécimen 7b)"),
    ).toBeVisible();
    await expect(
      page.getByText(/Bilan santé financière — \d{4}-\d{2}-\d{2}/).first(),
    ).toBeVisible();

    // 1b. BUG CORRIGÉ (retour d'équipe) : le statut de signature est un
    //     badge dérivé À CÔTÉ de la pièce, jamais incrusté dans son nom.
    const ententeRow = page.locator("li", {
      hasText: "Entente de services-conseils (spécimen 7b)",
    });
    await expect(ententeRow).toContainText(
      /En attente|Partiellement signée|Signée/,
    );
    await expect(
      page.getByText(/— à signer(?!…)/),
    ).toHaveCount(0);

    // 2. Dépôt chiffré d'un PDF (analyse magic bytes côté serveur)
    const label = `Préavis REER ${id}`;
    await page.getByLabel("Libellé affiché").fill(label);
    await page.locator("#category").selectOption("AVIS_COTISATION");
    await page.locator("#vault-file").setInputFiles({
      name: `preavis-reer-${id}.pdf`,
      mimeType: "application/pdf",
      buffer: minimalPdf,
    });
    await page.getByRole("button", { name: "Déposer au coffre" }).click();
    await expect(
      page.getByText(new RegExp(`« ${label} » déposé au coffre`)),
    ).toBeVisible();

    // 3. Génération d'un rapport PDF serveur → déposé au coffre
    await page
      .getByRole("button", { name: "Dossier client — synthèse (PDF)" })
      .click();
    await expect(
      page.getByText(/Rapport généré et déposé au coffre/),
    ).toBeVisible();

    // 4. Partage au portail du mandat (idempotent) — la copie close du
    //    refus seedé porte le même libellé (design 7c) : on cible la
    //    ligne qui porte un badge d'enveloppe.
    const mandatRow = page
      .locator("li", { hasText: "Mandat de planification financière" })
      .filter({ has: page.locator("[data-testid='envelope-badge']") });
    await mandatRow.getByText("Partager", { exact: true }).click();
    await mandatRow
      .getByRole("button", { name: "Partager au portail particulier" })
      .click();
    await expect(
      page.getByText(/Partagée au portail particulier|déjà partagée/),
    ).toBeVisible();
  });

  test("signature 7b : assistant d'enveloppe multi-signataires, badges, relance et annulation", async ({
    page,
  }) => {
    const id = Date.now().toString(36);
    const label = `Avenant ${id}`;
    await loginAdvisor(page);
    await openVault(page);

    // 1. Pièce PDF fraîche au coffre
    await page.getByLabel("Libellé affiché").fill(label);
    await page.locator("#category").selectOption("CONTRAT");
    await page.locator("#vault-file").setInputFiles({
      name: `avenant-${id}.pdf`,
      mimeType: "application/pdf",
      buffer: minimalPdf,
    });
    await page.getByRole("button", { name: "Déposer au coffre" }).click();
    await expect(
      page.getByText(new RegExp(`« ${label} » déposé au coffre`)),
    ).toBeVisible();

    // 2. Assistant d'enveloppe : couple portail + contre-signature cabinet
    const row = page.locator("li", { hasText: label });
    await row.getByText("Signature", { exact: true }).click();
    await row.getByTestId("open-envelope-wizard").click();
    const wizard = row.getByTestId("envelope-wizard");
    await expect(wizard).toBeVisible();

    const addSigner = async (
      selectLabel: string,
      optionLabel: string,
    ) => {
      const card = wizard.getByLabel(selectLabel).locator("xpath=..");
      await wizard.getByLabel(selectLabel).selectOption({ label: optionLabel });
      await card.getByRole("button", { name: "Ajouter" }).click();
    };
    await addSigner("Choisir un compte portail", "Jean Bouchard");
    await addSigner("Choisir un compte portail", "Sophie Bouchard");
    await addSigner("Choisir un membre du cabinet", "Marie Tremblay");
    await expect(
      wizard.getByTestId("wizard-signer-list"),
    ).toContainText("Sophie Bouchard");
    await expect(
      wizard.getByTestId("wizard-signer-list"),
    ).toContainText("Marie Tremblay");

    // 3. Chaque signataire reçoit une zone Signature (préréglage
    //    déterministe) — le PDF est d'abord rendu dans l'éditeur.
    await expect(wizard.getByTestId("pdf-page-1")).toBeVisible({
      timeout: 20000,
    });
    const signerList = wizard.getByTestId("wizard-signer-list");
    const preset = wizard.getByTestId("preset-signature-bottom");
    for (const [index, name] of [
      "Jean Bouchard",
      "Sophie Bouchard",
      "Marie Tremblay",
    ].entries()) {
      await signerList
        .getByRole("button", { name: `${index + 1}. ${name}` })
        .click();
      await preset.click();
    }
    await expect(wizard.getByTestId("field-chip")).toHaveCount(3);

    // 4. Envoi — avis partis selon l'ordre séquentiel
    await wizard.getByTestId("wizard-submit").click();
    await expect(
      page.getByText(/Enveloppe envoyée à 3 signataire/),
    ).toBeVisible({ timeout: 15000 });

    // 5. Badge dérivé + puces par signataire + bloc de contre-signature
    //    (Marie attend son tour : enveloppe séquentielle). Le panneau
    //    s'ouvre de lui-même lorsqu'une enveloppe est active.
    const updatedRow = page.locator("li", { hasText: label });
    await expect(updatedRow.getByTestId("envelope-badge")).toHaveText(
      /En attente/,
    );
    await expect(updatedRow).toContainText("Jean Bouchard");
    await expect(updatedRow).toContainText("Sophie Bouchard");
    await expect(updatedRow).toContainText("Marie Tremblay");
    await expect(updatedRow.getByTestId("staff-sign-block")).toBeVisible();
    await expect(updatedRow.getByTestId("staff-sign-block")).toContainText(
      /avant vous/,
    );

    // 6. Relance manuelle (cadence anti-spam 4 h) puis annulation
    await updatedRow.getByTestId(/remind-/).click();
    await expect(
      page.getByText(/relance\(s\) envoyée\(s\)/),
    ).toBeVisible({ timeout: 15000 });
    await updatedRow.getByRole("button", { name: "Annuler l'enveloppe" }).click();
    await expect(
      page.getByText(/Enveloppe annulée/),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("li", { hasText: label }).getByTestId("envelope-badge"),
    ).toHaveText(/Annulée/);
  });

  test("bureau des signatures 7c : suivi, historique, contre-signature en direct et nouvel envoi", async ({
    page,
  }) => {
    const id = Date.now().toString(36);
    const label = `Mandat cabinet ${id}`;
    await loginAdvisor(page);

    // 0. Pièce PDF + enveloppe à signataire unique = le MEMBRE DU CABINET
    //    (contre-signature « à signer par moi »).
    await openVault(page);
    await page.getByLabel("Libellé affiché").fill(label);
    await page.locator("#category").selectOption("CONTRAT");
    await page.locator("#vault-file").setInputFiles({
      name: `mandat-cabinet-${id}.pdf`,
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
      .getByLabel("Choisir un membre du cabinet")
      .selectOption({ label: "Marie Tremblay" });
    await wizard
      .getByLabel("Choisir un membre du cabinet")
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

    // 1. Bureau « Signatures » : les trois sections sont rendues et les
    //    rondes semées (7c) y figurent — mandat refusé en historique,
    //    nouvel envoi et entente en circulation.
    await page.goto("/signatures");
    await expect(page.getByTestId("desk-my-pending")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /À signer par moi/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Signatures en circulation/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Historique des rondes closes/ }),
    ).toBeVisible();
    await expect(page.getByTestId("desk-in-flight")).toContainText(
      "Entente de services-conseils",
    );
    await expect(page.getByTestId("desk-history")).toContainText(
      "Mandat de planification financière",
    );
    await expect(page.getByTestId("desk-history")).toContainText(/Refusée/);

    // 2. La nouvelle enveloppe attend MA contre-signature → signature
    //    EN DIRECT dans le document, façon DocuSign.
    const myCard = page.locator("li[data-testid^='desk-my-']", {
      hasText: label,
    });
    await myCard.getByTestId("desk-open-sign").click();
    await expect(page).toHaveURL(/\/signatures\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("signing-viewer")).toBeVisible({
      timeout: 20000,
    });
    await page.getByTestId("signing-field-signature").click();
    await expect(page.getByTestId("adopt-name")).toHaveValue(
      "Marie Tremblay",
    );
    await page.getByTestId("adopt-style-parisienne").click();
    await page.getByTestId("adopt-submit").click();
    await expect(page.getByTestId("staff-adopted-ok")).toBeVisible();
    await page.getByTestId("staff-sign-submit").click();
    await expect(page.getByTestId("staff-signed-final")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(/la copie certifiée est téléchargeable/),
    ).toBeVisible();

    // Signataire unique → ronde close : téléchargement immédiat du
    // document final (estampillé + certificat fusionné).
    const [finalDl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("staff-download-after-sign").click(),
    ]);
    const fs = await import("node:fs/promises");
    const finalBytes = await fs.readFile(await finalDl.path());
    expect(finalBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(finalBytes.length).toBeGreaterThan(2000);

    // 3. « Nouvel envoi » depuis l'HISTORIQUE (ronde close) sans retour
    //    au coffre : on annule une ronde fraîche, puis on la relance en
    //    un geste depuis le bureau — sans tout reconfigurer.
    await openVault(page);
    const labelCancel = `Avenant relance ${id}`;
    await page.getByLabel("Libellé affiché").fill(labelCancel);
    await page.locator("#category").selectOption("CONTRAT");
    await page.locator("#vault-file").setInputFiles({
      name: `avenant-relance-${id}.pdf`,
      mimeType: "application/pdf",
      buffer: minimalPdf,
    });
    await page.getByRole("button", { name: "Déposer au coffre" }).click();
    await expect(
      page.getByText(new RegExp(`« ${labelCancel} » déposé au coffre`)),
    ).toBeVisible();
    const rowCancel = page.locator("li", { hasText: labelCancel });
    await rowCancel.getByText("Signature", { exact: true }).click();
    await rowCancel.getByTestId("open-envelope-wizard").click();
    const wizardCancel = rowCancel.getByTestId("envelope-wizard");
    await wizardCancel
      .getByLabel("Choisir un membre du cabinet")
      .selectOption({ label: "Marie Tremblay" });
    await wizardCancel
      .getByLabel("Choisir un membre du cabinet")
      .locator("xpath=..")
      .getByRole("button", { name: "Ajouter" })
      .click();
    await expect(wizardCancel.getByTestId("pdf-page-1")).toBeVisible({
      timeout: 20000,
    });
    await wizardCancel.getByTestId("preset-signature-bottom").click();
    await wizardCancel.getByTestId("wizard-submit").click();
    await expect(
      page.getByText(/Enveloppe envoyée à 1 signataire/),
    ).toBeVisible({ timeout: 15000 });
    await rowCancel
      .getByRole("button", { name: "Annuler l'enveloppe" })
      .click();
    await expect(
      page.getByText(/Enveloppe annulée/),
    ).toBeVisible({ timeout: 15000 });

    await page.goto("/signatures");
    const cancelledCard = page.locator("[data-testid^='desk-history-']", {
      hasText: labelCancel,
    });
    await expect(cancelledCard).toContainText(/Annulée/);
    await cancelledCard.locator("[data-testid^='desk-resend-']").click();
    await expect(
      page.getByText(/Nouvel envoi reparti/),
    ).toBeVisible({ timeout: 15000 });
    // L'envoi reparti attend à nouveau MA contre-signature.
    await expect(
      page.locator("li[data-testid^='desk-my-']", { hasText: labelCancel }),
    ).toBeVisible();
  });

  test("liens inter-clients certifiés 7c : navigation croisée, révocation auditée, nouvelle certification", async ({
    page,
  }) => {
    await loginAdvisor(page);

    // 1. Fiche Jean : le lien seedé CONJOINT apparaît — puce cliquable
    //    dans l'en-tête ET carte « Liens certifiés ».
    await page.goto("/clients");
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
    const jeanUrl = page.url();
    await expect(page.getByTestId("client-links-card")).toBeVisible();
    const sophieChip = page
      .locator("[data-testid^='header-link-nav-']")
      .first();
    await expect(sophieChip).toContainText("Sophie Bouchard");

    // 2. Navigation croisée : la puce mène à la fiche de Sophie, qui
    //    montre le lien RÉCIPROQUE vers Jean.
    const sophieHref = (await sophieChip.getAttribute("href")) ?? "";
    expect(sophieHref).toMatch(/\/clients\/[0-9a-f-]{36}$/);
    await sophieChip.click();
    await expect(page).toHaveURL(sophieHref);
    expect(page.url()).not.toBe(jeanUrl);
    await expect(
      page.getByRole("heading", { name: "Sophie Bouchard" }).first(),
    ).toBeVisible();
    await expect(
      page
        .locator("[data-testid^='header-link-nav-']")
        .filter({ hasText: "Jean Bouchard" }),
    ).toBeVisible();

    // 3. Révocation (auditée) depuis la fiche de Sophie, puis
    //    re-certification complète via le formulaire.
    await page
      .locator("[data-testid^='client-link-row-']")
      .first()
      .locator("[data-testid^='client-link-remove-']")
      .click();
    await expect(
      page.locator("[data-testid^='client-link-row-']"),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-testid^='header-link-nav-']"),
    ).toHaveCount(0);

    await page.getByTestId("client-link-add-open").click();
    await page
      .getByTestId("client-link-select-other")
      .selectOption({ label: "Jean Bouchard" });
    await page.getByTestId("client-link-select-type").selectOption("CONJOINT");
    await page
      .getByLabel("Note (facultative)")
      .fill("Couple — recertifié en démo e2e");
    await page.getByTestId("client-link-submit").click();
    await expect(
      page.locator("[data-testid^='client-link-row-']"),
    ).toHaveCount(1);
    await expect(page.getByTestId("client-links-card")).toContainText(
      "recertifié en démo e2e",
    );
    await expect(
      page
        .locator("[data-testid^='header-link-nav-']")
        .filter({ hasText: "Jean Bouchard" }),
    ).toBeVisible();
  });

  test("conformité : audit filtrable, export CSV et export client Loi 25", async ({
    page,
  }) => {
    const fs = await import("node:fs/promises");
    await loginAdvisor(page);
    await page.goto("/parametres/conformite");

    await expect(
      page.getByRole("heading", { name: /Conformité/ }).first(),
    ).toBeVisible();

    // 1. Filtre « Action contient » : les opérations documents remontent
    await page.getByLabel("Action contient").fill("documents");
    await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(
      page.getByText(/documents\.(file|share|signature)/).first(),
    ).toBeVisible();

    // 2. Export CSV du journal filtré — contenu réel vérifié
    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /Exporter le journal filtré/ }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
    const csvPath = await csvDownload.path();
    const csvContent = await fs.readFile(csvPath, "utf8");
    expect(csvContent).toContain("documents.");

    // 3. Export complet des données d'un client (Loi 25) — JSON réel
    await page.locator("#clientId").selectOption({ label: "Jean Bouchard" });
    const [jsonDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exporter (JSON)" }).click(),
    ]);
    const jsonPath = await jsonDownload.path();
    const parsed = JSON.parse(await fs.readFile(jsonPath, "utf8")) as {
      client: { firstName: string; lastName: string };
      bundle?: { documents?: unknown[] };
      documents?: unknown[];
    };
    expect(parsed.client.firstName).toBe("Jean");
    expect(parsed.client.lastName).toBe("Bouchard");
  });
});
