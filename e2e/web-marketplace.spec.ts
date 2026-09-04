import { expect, test } from "@playwright/test";

import { minimalPdf } from "./fixtures";

/**
 * Critère de succès Sprint 3 : un utilisateur peut obtenir son portrait
 * financier (parcours public d'acquisition — FR-FNAE-001).
 */
test.use({ baseURL: "http://localhost:3002" });

test.describe("Sprint 3 — Financial Needs Assessment Engine", () => {
  test("un visiteur obtient son portrait financier (questionnaire → rapport)", async ({
    page,
  }) => {
    await page.goto("/analyse");

    // Étape 1 — Profil
    await page.getByLabel("Votre âge").fill("38");
    await page.getByLabel("Votre situation").selectOption("FAMILY");
    await page.getByLabel("Personnes à votre charge").fill("2");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 2 — Revenus et dépenses
    await page.getByLabel("Revenu annuel brut (personnel)").fill("85000");
    await page.getByLabel("Autres revenus annuels du ménage").fill("20000");
    await page.getByLabel("Logement (mensuel)").fill("1900");
    await page.getByLabel("Autres dépenses mensuelles").fill("2100");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 3 — Actifs
    await page.getByLabel("Épargne liquide").fill("15000");
    await page.getByLabel("Placements").fill("30000");
    await page.getByLabel("Épargne-retraite").fill("90000");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 4 — Dettes
    await page.getByLabel("Dettes à la consommation").fill("3000");
    await page.getByLabel("Paiements mensuels sur ces dettes").fill("150");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 5 — Retraite, protection, objectifs
    await page.getByLabel("Âge de retraite visé").fill("62");
    await page.getByLabel("Épargne mensuelle actuelle").fill("700");
    await page.getByLabel("Assurance vie / invalidité").selectOption("PARTIAL");
    await page
      .getByRole("button", { name: "Voir mon portrait financier" })
      .click();

    // Portrait financier : score, profil, dimensions, priorités
    await expect(page).toHaveURL(/\/portrait\/[0-9a-f-]{36}\?k=/);
    await expect(
      page.getByRole("heading", { name: /Fondations fragiles|En progression|Situation solide|Excellente santé financière/ }),
    ).toBeVisible();
    await expect(page.getByText("sur 100").first()).toBeVisible();
    await expect(page.getByText("Fonds d'urgence").first()).toBeVisible();
    await expect(page.getByText("Vos 3 priorités")).toBeVisible();
  });

  test("le portrait illisible sans capability token (ADR-006)", async ({
    page,
  }) => {
    await page.goto(`/portrait/${crypto.randomUUID()}`);
    await expect(
      page.getByText(/could not be found|introuvable/i),
    ).toBeVisible();
  });

  test("capture d'un lead consenti (Loi 25) depuis le portrait", async ({
    page,
  }) => {
    // Questionnaire express (identique au test précédent, champs requis)
    await page.goto("/analyse");
    await page.getByLabel("Votre âge").fill("45");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Revenu annuel brut (personnel)").fill("60000");
    await page.getByLabel("Autres revenus annuels du ménage").fill("0");
    await page.getByLabel("Logement (mensuel)").fill("1400");
    await page.getByLabel("Autres dépenses mensuelles").fill("1600");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Épargne liquide").fill("2000");
    await page.getByLabel("Placements").fill("0");
    await page.getByLabel("Épargne-retraite").fill("15000");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Dettes à la consommation").fill("8000");
    await page.getByLabel("Paiements mensuels sur ces dettes").fill("300");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Épargne mensuelle actuelle").fill("100");
    await page
      .getByRole("button", { name: "Voir mon portrait financier" })
      .click();
    await expect(page).toHaveURL(/\/portrait\/[0-9a-f-]{36}\?k=/);

    // Sans consentement, impossible de soumettre (checkbox requise)
    const id = Date.now().toString(36);
    await page.getByLabel("Prénom").fill("Luc");
    await page.getByLabel("Nom", { exact: true }).fill("Pelletier");
    await page.getByLabel("Courriel").fill(`luc-${id}@exemple.ca`);
    await page.getByLabel(/je consens/i).check();
    await page
      .getByRole("button", { name: "Être contacté par un professionnel" })
      .click();

    await expect(page.getByText("Demande envoyée ✔")).toBeVisible();
  });
});

/**
 * Critère de succès Sprint 6 (Marketplace) : « connexion prospect-conseiller »
 * — annuaire opt-in, matching transparent depuis le portrait, et demande
 * de contact qui atterrit dans la boîte Leads du conseiller (Loi 25).
 */
test.describe("Sprint 6 — Marketplace", () => {
  test("annuaire opt-in : recherche, profil déclaratif, contact → lead conseiller", async ({
    page,
    context,
  }) => {
    // Annuaire public : les deux profils démo sont listés (opt-in)
    await page.goto("/conseillers");
    await expect(
      page.getByRole("heading", { name: "Trouver un conseiller financier" }),
    ).toBeVisible();
    await expect(page.getByText("Marie Tremblay").first()).toBeVisible();
    await expect(page.getByText("Karim Haddad").first()).toBeVisible();

    // Filtre par spécialité : Retraite → seule Marie demeure
    await page.getByLabel("Spécialité").selectOption("RETIREMENT");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page.getByText("Marie Tremblay").first()).toBeVisible();
    await expect(page.getByText("Karim Haddad")).toHaveCount(0);

    // Profil public : avertissement « informations déclaratives » (AMF)
    await page.getByRole("link", { name: "Voir le profil" }).first().click();
    await expect(page).toHaveURL(/\/conseillers\/[0-9a-f-]{36}/);
    await expect(
      // exact : « Contacter Marie Tremblay » est aussi un heading de la page
      page.getByRole("heading", { name: "Marie Tremblay", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/non vérifiées par CoAdvisor/i),
    ).toBeVisible();

    // Prise de contact consentie (Loi 25)
    const id = Date.now().toString(36);
    await page.getByLabel("Prénom").fill("Nadia");
    await page.getByLabel("Nom", { exact: true }).fill("Prévost");
    await page.getByLabel("Courriel").fill(`nadia-${id}@exemple.ca`);
    await page
      .getByLabel("Votre message")
      .fill(
        "Bonjour, je veux optimiser mon REER et préparer ma retraite dans 12 ans.",
      );
    await page.getByLabel(/je consens à ce que mes coordonnées/i).check();
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(
      page.getByText(/Votre demande a été transmise à Marie Tremblay/),
    ).toBeVisible();

    // Côté conseiller (:3000) : le lead « Annuaire public » est dans la boîte
    await context.clearCookies(); // cookie partagé sur localhost
    await page.goto("http://localhost:3000/login");
    await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("http://localhost:3000/leads");
    await expect(page.getByText("Annuaire public").first()).toBeVisible();
    await page.getByRole("link", { name: /Nadia Prévost/ }).first().click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/);
    await expect(
      page.getByRole("heading", { name: "Demande via l'annuaire public" }),
    ).toBeVisible();
    await expect(
      page.getByText(/je veux optimiser mon REER/i),
    ).toBeVisible();
  });

  test("le portrait FNAE recommande des conseillers avec raisons explicites", async ({
    page,
  }) => {
    // Questionnaire express (champs requis — même gabarit que le test Sprint 3)
    await page.goto("/analyse");
    await page.getByLabel("Votre âge").fill("52");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Revenu annuel brut (personnel)").fill("95000");
    await page.getByLabel("Autres revenus annuels du ménage").fill("0");
    await page.getByLabel("Logement (mensuel)").fill("1600");
    await page.getByLabel("Autres dépenses mensuelles").fill("1800");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Épargne liquide").fill("8000");
    await page.getByLabel("Placements").fill("40000");
    await page.getByLabel("Épargne-retraite").fill("120000");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Dettes à la consommation").fill("12000");
    await page.getByLabel("Paiements mensuels sur ces dettes").fill("450");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByLabel("Épargne mensuelle actuelle").fill("500");
    await page
      .getByRole("button", { name: "Voir mon portrait financier" })
      .click();
    await expect(page).toHaveURL(/\/portrait\/[0-9a-f-]{36}\?k=/);

    // Section recommandations : score + raisons affichées (mktmatch-1.0)
    await expect(
      page.getByText("Conseillers recommandés pour votre profil"),
    ).toBeVisible();
    await expect(page.getByText(/Adéquation \d+\/100/).first()).toBeVisible();
    await expect(
      page.getByText(/votre priorité n° /).first(),
    ).toBeVisible();

    // Le profil recommandé s'ouvre avec la preuve du portrait (recalcul serveur)
    await page.getByRole("link", { name: "Voir le profil" }).first().click();
    await expect(page).toHaveURL(
      /\/conseillers\/[0-9a-f-]{36}\?assessment=[0-9a-f-]{36}&token=[0-9a-f-]{36}/,
    );
    await expect(
      page.getByRole("button", { name: "Envoyer ma demande" }),
    ).toBeVisible();
  });
});

/**
 * Critère de succès Sprint 7 (côté public) : un conseiller peut partager
 * une pièce par lien horodaté 7 jours — le destinataire consulte une page
 * publique vérifiée (empreinte SHA-256 affichée) et télécharge le fichier
 * déchiffré ; le lien révoqué (ou inconnu) tombe sur l'état « invalide ».
 */
test.describe("Sprint 7 — Lien public de partage sécurisé", () => {
  const ADVISOR_APP = "http://localhost:3000";

  test("création → téléchargement public vérifié → révocation immédiate", async ({
    page,
  }) => {
    // ── 0. Un jeton inconnu donne l'état « invalide » ────────────
    await page.goto(`/partage/${"a".repeat(24)}`);
    await expect(
      page.getByText("Ce lien n'est plus valide"),
    ).toBeVisible();

    // ── 1. Conseiller : lien 7 jours sur le bilan FHI démo ───────
    await page.goto(`${ADVISOR_APP}/login`);
    await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto(`${ADVISOR_APP}/clients`);
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await page
      .getByRole("link", { name: "Coffre documentaire" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/documents/);

    const bilanRow = page
      .locator("li", { hasText: "Bilan santé financière — " })
      .filter({ hasNotText: "— signé" })
      .first();
    await bilanRow.getByText("Partager", { exact: true }).click();
    await bilanRow
      .getByRole("button", { name: "Créer un lien public (7 jours)" })
      .click();

    // L'URL complète n'apparaît qu'UNE seule fois
    await expect(
      page.getByText(/Copiez-le maintenant — il ne sera plus affiché/),
    ).toBeVisible();
    const urlCode = page.locator("code", { hasText: "/partage/" }).first();
    await expect(urlCode).toBeVisible();
    const shareUrl = (await urlCode.textContent())?.trim() ?? "";
    const tokenMatch = shareUrl.match(/\/partage\/([A-Za-z0-9_-]{20,90})/);
    expect(tokenMatch).not.toBeNull();
    const token = tokenMatch![1];

    // ── 2. Destinataire : page publique vérifiée + téléchargement ─
    await page.goto(`/partage/${token}`);
    await expect(page.getByText("Lien vérifié")).toBeVisible();
    await expect(
      page.getByText("Document partagé avec vous"),
    ).toBeVisible();
    await expect(page.getByText("Cabinet Démo")).toBeVisible();
    await expect(
      page.getByText(/Bilan santé financière — \d{4}-\d{2}-\d{2}/).first(),
    ).toBeVisible();
    await expect(page.getByText(/lien valide jusqu'au/)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Télécharger" }).click(),
    ]);
    const fs = await import("node:fs/promises");
    const bytes = await fs.readFile(await download.path());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // ── 3. Révocation conseiller → le lien meurt immédiatement ───
    await page.goto(
      `${ADVISOR_APP}/clients`,
    );
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await page
      .getByRole("link", { name: "Coffre documentaire" })
      .first()
      .click();
    const bilanRowAgain = page
      .locator("li", { hasText: "Bilan santé financière — " })
      .filter({ hasNotText: "— signé" })
      .first();
    await bilanRowAgain.getByText("Partager", { exact: true }).click();
    // Révoque TOUTES les lignes « Lien (échéance …) » (des runs
    // antérieurs peuvent en avoir laissé) — jamais le partage portail.
    // Attentes par comptage : une révocation à la fois, sans course.
    const linkShares = bilanRowAgain.locator("li", {
      hasText: "Lien (échéance",
    });
    let remaining = await linkShares.count();
    while (remaining > 0) {
      await linkShares
        .first()
        .getByRole("button", { name: "Révoquer" })
        .click();
      await expect(linkShares).toHaveCount(remaining - 1);
      await expect(
        page.getByText(/Partage révoqué — le lien est inactif/),
      ).toBeVisible();
      remaining -= 1;
    }

    await page.goto(`/partage/${token}`);
    await expect(
      page.getByText("Ce lien n'est plus valide"),
    ).toBeVisible();
  });
});

test.describe("Sprint 7b — Signature externe (sans compte, capability token)", () => {
  const ADVISOR_APP = "http://localhost:3000";

  async function loginAdvisor(page: import("@playwright/test").Page) {
    await page.goto(`${ADVISOR_APP}/login`);
    await page.getByLabel("Courriel").fill("demo@coadvisor.ca");
    await page.getByLabel("Mot de passe").fill("Demo#2026coadvisor");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  /** Crée une enveloppe à signataire externe unique et retourne son lien. */
  async function createExternalEnvelope(
    page: import("@playwright/test").Page,
    id: string,
  ) {
    const label = `Attestation externe ${id}`;
    await loginAdvisor(page);
    await page.goto(`${ADVISOR_APP}/clients`);
    await page.getByRole("link", { name: /Jean Bouchard/ }).first().click();
    await page
      .getByRole("link", { name: "Coffre documentaire" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/documents/);

    await page.getByLabel("Libellé affiché").fill(label);
    await page.locator("#category").selectOption("CONTRAT");
    await page.locator("#vault-file").setInputFiles({
      name: `attestation-${id}.pdf`,
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
    await wizard.getByLabel("Nom complet du signataire externe").fill("Me Test Notaire");
    await wizard
      .getByLabel("Courriel du signataire externe")
      .fill(`notaire-${id}@exemple.ca`);
    await wizard
      .getByLabel("Courriel du signataire externe")
      .locator("xpath=..")
      .getByRole("button", { name: "Ajouter" })
      .click();
    await expect(wizard.getByTestId("pdf-page-1")).toBeVisible({
      timeout: 20000,
    });
    await wizard.getByTestId("preset-signature-bottom").click();
    await wizard.getByTestId("wizard-submit").click();
    await expect(page.getByTestId("external-links")).toBeVisible({
      timeout: 15000,
    });
    const url =
      (await page
        .getByTestId("external-links")
        .locator("code")
        .first()
        .textContent()) ?? "";
    expect(url).toContain("/signature/");
    return { url: url.trim(), label };
  }

  test("lien externe : lecture PDF bornée au jeton → signature → confirmation", async ({
    page,
  }) => {
    const id = Date.now().toString(36);
    // Un jeton inconnu donne l'état « invalide ».
    await page.goto(`/signature/${"b".repeat(24)}`);
    await expect(
      page.getByText("Ce lien de signature n'est pas valide"),
    ).toBeVisible();

    const { url, label } = await createExternalEnvelope(page, id);

    // Lecture de la pièce : flux PDF déchiffré, borné au jeton (RLS publique).
    const pdfResponse = await page.request.get(`${url}/document`);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");

    // Page de signature : identité, pièce, consentement — et Sprint 7c,
    // la pièce s'affiche EN DIRECT avec adoption façon DocuSign.
    await page.goto(url);
    await expect(
      page.getByText("Signature électronique demandée"),
    ).toBeVisible();
    await expect(page.getByText(label)).toBeVisible();
    await expect(
      page.getByText("Me Test Notaire", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByTestId("signing-viewer")).toBeVisible({
      timeout: 20000,
    });
    await page.getByTestId("signing-field-signature").click();
    await expect(page.getByTestId("adopt-name")).toHaveValue("Me Test Notaire");
    await page.getByTestId("adopt-style-great-vibes").click();
    await page.getByTestId("adopt-submit").click();
    await expect(page.getByTestId("external-adopted-ok")).toBeVisible();
    await page.getByTestId("external-sign-submit").click();
    // Preuve de complétion (course RSC tolérée : flash local OU carte
    // d'état « signature consignée » rendue par l'action serveur).
    await expect(
      page
        .getByTestId("external-signed-final")
        .or(page.getByText("Votre signature est consignée")),
    ).toBeVisible({ timeout: 15000 });

    // Rechargement : l'état « signé » + téléchargement de la pièce
    // finale (certificat à la suite) pour le signataire externe.
    await page.goto(url);
    await expect(
      page.getByText("Votre signature est consignée"),
    ).toBeVisible();
    await expect(page.getByTestId("external-download-signed")).toBeVisible();
    // Le flux « document » sert désormais la COPIE FINALE estampillée
    // (la ronde est close) — vérifié au niveau octet.
    const finalPdf = await page.request.get(`${url}/document`);
    expect(finalPdf.status()).toBe(200);
    const finalBytes = await finalPdf.body();
    expect(finalBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(finalBytes.length).toBeGreaterThan(2000);
  });

  test("lien externe : refus motivé → état terminal consigné", async ({
    page,
  }) => {
    const id = `refus${Date.now().toString(36)}`;
    const { url } = await createExternalEnvelope(page, id);

    await page.goto(url);
    await expect(page.getByTestId("signing-viewer")).toBeVisible({
      timeout: 20000,
    });
    await page.getByTestId("external-decline-toggle").click();
    await page
      .getByTestId("external-decline-reason")
      .fill("Je dois relire l'attestation avec mon client avant de signer.");
    await page.getByTestId("external-decline-submit").click();
    await expect(
      page
        .getByTestId("external-signed-final")
        .or(page.getByText("Vous avez refusé de signer ce document")),
    ).toBeVisible({ timeout: 15000 });

    await page.goto(url);
    await expect(
      page.getByText("Vous avez refusé de signer ce document"),
    ).toBeVisible();
    await expect(page.getByText(/relire l'attestation/)).toBeVisible();
    // 7c : même sur refus, la pièce constatant le refus est téléchargeable.
    await expect(page.getByTestId("external-declined-note")).toBeVisible();
    await expect(page.getByTestId("external-download-final")).toBeVisible();
    const refusPdf = await page.request.get(`${url}/document`);
    expect(refusPdf.status()).toBe(200);
    const refusBytes = await refusPdf.body();
    expect(refusBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
