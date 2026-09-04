
// ═══ Sprint 8 — photo marketplace vers le coffre (ADR-013) ═══

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Portrait démo 512² : dégradé indigo→bleu façon avatar premium. */
function makeDemoAvatarPng(size = 512): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const t = x / size;
      const u = y / size;
      const o = rowStart + 1 + x * 3;
      raw[o] = Math.round(56 + 30 * t + 20 * u); // R
      raw[o + 1] = Math.round(88 + 60 * (1 - t)); // G
      raw[o + 2] = Math.round(225 - 45 * u); // B
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Photo vitrine de Marie, versée au coffre chiffré (idempotent). */
async function seedAdvisorVaultPhoto(
  tx: Parameters<Parameters<typeof withSystemContext>[0]>[0],
  tenantId: string,
  advisorId: string,
): Promise<string | null> {
  const profile = await tx.advisorPublicProfile.findUnique({
    where: { advisorId },
    select: { id: true, photoStorageKey: true },
  });
  if (!profile || profile.photoStorageKey) return null;
  const storage = getObjectStorage();
  const key = `avatars/${tenantId}/${crypto.randomUUID()}.enc`;
  const stored = await storage.put(Readable.from(makeDemoAvatarPng()), key);
  await tx.advisorPublicProfile.update({
    where: { id: profile.id },
    data: {
      photoStorageKey: key,
      photoSha256: stored.sha256,
      photoSizeBytes: stored.sizeBytes,
      photoMimeType: "image/png",
      photoContentTag: stored.contentTag,
      photoData: null,
    },
  });
  return "Photo publique de Marie versée au coffre chiffré (Sprint 8)";
}


/**
 * Données de démonstration Sprints 7 + 7b + 7c — coffre, portail,
 * enveloppes de signature multi-signataires, liens inter-clients
 * certifiés et scénario « refus → nouvel envoi ».
 *
 *   pnpm --filter @coadvisor/documents seed:demo
 *
 * Contrairement à un seed SQL, ce script REJOUE LES VRAIS FLUX
 * applicatifs (services → RBAC → audit → timeline) : les pièces,
 * partages, invitations, liens et enveloppes sont indiscernables de
 * la prod, et chaque étape est idempotente (ré-exécutable sans doublon).
 *
 * Prérequis : `pnpm db:migrate && pnpm db:seed` (cabinet Cabinet Démo,
 * Marie Tremblay ADMIN, dossier Jean Bouchard + profil financier)
 * ET DOCUMENTS_MASTER_KEY défini (chiffrement du coffre).
 *
 * Identifiants démo (DEV UNIQUEMENT) :
 *   conseiller  : demo@coadvisor.ca / Demo#2026coadvisor
 *   particuliers: jean.bouchard@exemple.ca / Demo#2026coadvisor
 *                 sophie.bouchard@exemple.ca / Demo#2026coadvisor (conjointe)
 *   externe     : lien imprimé en console à la création de l'enveloppe.
 */
import { Readable } from "node:stream";

import { signupIndividual } from "@coadvisor/core-platform";
import { withSystemContext } from "@coadvisor/database";
import {
  calculateFhi,
  claimPortalInvite,
  createPortalInvite,
  listPortalLinksForClient,
} from "@coadvisor/health-engine";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { createClient, createClientLink, listClientLinks } from "@coadvisor/crm";

import { deflateSync } from "node:zlib";

import { generateReport } from "../src/reports/service";
import { getObjectStorage } from "../src/storage/resolver";
// Le point d'entrée du package câble l'adaptateur coffre → signdoc
// (composition racine, ADR-012) puis ré-exporte l'API Signdoc.
import {
  createEnvelope,
  declineAsPortalUser,
  listDocumentEnvelopes,
  resendEnvelope,
} from "../src/index";
import { shareToPortal } from "../src/sharing/service";
import { listClientDocuments, uploadDocument } from "../src/vault/service";
import type { DocumentsActor, RequestMeta } from "../src/actor";

const DEMO_TENANT_SLUG = "cabinet-demo";
const ADVISOR_EMAIL = "demo@coadvisor.ca";
const CLIENT_EMAIL = "jean.bouchard@exemple.ca";
const SPOUSE_EMAIL = "sophie.bouchard@exemple.ca";
const NOTARY_EMAIL = "karine.legal@exemple.ca";
const DEMO_PASSWORD = "Demo#2026coadvisor";
const META: RequestMeta = {
  ipAddress: "127.0.0.1",
  userAgent: "seed-demo-documents/1.0",
};

/** Petit mandat PDF de démonstration, 1 page (Sprint 7 — historique). */
async function buildMandatPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 780;
  page.drawText("MANDAT DE PLANIFICATION FINANCIERE (DEMONSTRATION)", {
    x: 50,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.69),
  });
  y -= 40;
  const lines = [
    "Entre Jean Bouchard (le client) et le Cabinet Demo (le conseiller).",
    "",
    "Par le present mandat, le client autorise le conseiller a analyser sa",
    "situation financiere globale en vue de produire un plan de retraite,",
    "incluant l'examen des revenus, depenses, actifs, dettes et protections",
    "d'assurance declares au dossier.",
    "",
    "Ce document est un specimen de demonstration : il ne constitue pas un",
    "avis juridique ni financier. Il sert a illustrer la signature",
    "electronique horodatee de CoAdvisor (art. 2827 C.c.Q.).",
    "",
    "Fait a Montreal, le 31 juillet 2026.",
  ];
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 18;
  }
  return Buffer.from(await pdf.save());
}

/**
 * Entente de services-conseils, 3 pages (Sprint 7b) : pages à parapher
 * + page de signatures — illustre paraphes, couple, contre-signature du
 * cabinet et signataire externe sans compte.
 */
async function buildEntentePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const drawPage = (
    title: string,
    lines: string[],
    pageLabel: string,
  ): void => {
    const page = pdf.addPage([595, 842]);
    page.drawText(title, {
      x: 50,
      y: 780,
      size: 13,
      font: fontBold,
      color: rgb(0.12, 0.22, 0.69),
    });
    let y = 744;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 10.5, font });
      y -= 17;
    }
    page.drawText(pageLabel, {
      x: 50,
      y: 40,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  };

  drawPage(
    "ENTENTE DE SERVICES-CONSEILS (DEMONSTRATION)",
    [
      "Entre Jean Bouchard et Sophie Bouchard (les clients) et le Cabinet",
      "Demo (le conseiller), represente par Marie Tremblay.",
      "",
      "ARTICLE 1 — OBJET",
      "Les clients retiennent les services du conseiller pour l'analyse de",
      "leur situation financiere globale et l'elaboration d'un plan de",
      "retraite integre, incluant les projections de revenus, l'examen des",
      "protections d'assurance et la coordination avec leurs autres",
      "professionnels (notaire, comptable).",
      "",
      "ARTICLE 2 — DOCUMENTS FOURNIS",
      "Les clients s'engagent a fournir des informations exactes et",
      "completes, et a aviser le conseiller de tout changement important.",
    ],
    "Page 1 de 3 — paraphes des clients au bas de cette page (usage quebecois).",
  );

  drawPage(
    "ENTENTE DE SERVICES-CONSEILS (SUITE)",
    [
      "ARTICLE 3 — HONORAIRES",
      "Les honoraires sont de 1 500 $ plus taxes, payables a la livraison",
      "du plan. Aucun autre frais n'est exigible sans entente ecrite.",
      "",
      "ARTICLE 4 — CONFIDENTIALITE (LOI 25)",
      "Les renseignements personnels sont traites selon la politique de",
      "confidentialite du cabinet; les clients peuvent demander acces,",
      "rectification ou portabilite de leurs donnees en tout temps.",
      "",
      "ARTICLE 5 — DUREE ET RESILIATION",
      "L'entente prend fin a la livraison du plan; chaque partie peut y",
      "mettre fin sur avis ecrit de 10 jours.",
    ],
    "Page 2 de 3 — paraphes des clients au bas de cette page (usage quebecois).",
  );

  // Page 3 — SIGNATURES : libellés tracés à des positions EXPLICITES
  // (origine bas-gauche pdf-lib) pour que chaque zone placée par
  // l'assistant tombe pile sous SON libellé :
  //   Jean/Sophie noms y=632 → zones y 0,27/0,355 (fractions origine haut)
  //   Marie nom y=502 → zones y 0,42/0,50
  //   Karine attestation y=372/356 → zones y 0,60/0,68
  {
    const page = pdf.addPage([595, 842]);
    page.drawText("SIGNATURES", {
      x: 50,
      y: 780,
      size: 13,
      fontBold,
      color: rgb(0.12, 0.22, 0.69),
    });
    const intro = [
      "En foi de quoi, les parties ont signe electroniquement la presente",
      "entente par l'entremise de la plateforme CoAdvisor (art. 2827 C.c.Q.).",
      "",
      "Fait a Montreal, le 1er aout 2026.",
    ];
    let y = 744;
    for (const line of intro) {
      page.drawText(line, { x: 50, y, size: 10.5, font });
      y -= 17;
    }
    page.drawText("JEAN BOUCHARD (client)", { x: 50, y: 632, size: 10.5, font });
    page.drawText("SOPHIE BOUCHARD (cliente)", {
      x: 327,
      y: 632,
      size: 10.5,
      font,
    });
    page.drawText("MARIE TREMBLAY (conseiller, Cabinet Demo)", {
      x: 50,
      y: 502,
      size: 10.5,
      font,
    });
    page.drawText("ATTESTATION — Me Karine Legal, notaire :", {
      x: 50,
      y: 372,
      size: 10.5,
      font,
    });
    page.drawText("La declaration ci-dessus m'a ete presentee pour constatation.", {
      x: 50,
      y: 356,
      size: 10.5,
      font,
    });
    page.drawText(
      "Page 3 de 3 — zones de signature apposees automatiquement par CoAdvisor.",
      { x: 50, y: 40, size: 9, font, color: rgb(0.45, 0.45, 0.45) },
    );
  }

  return Buffer.from(await pdf.save());
}

const RELEVE_TEXT = [
  "RELEVE REER — BANQUE DEMO (SPECIMEN)",
  "------------------------------------",
  "Titulaire : Jean Bouchard",
  "Periode : 1er avril au 30 juin 2026",
  "",
  "Solde d'ouverture ......... 114 250,00 $",
  "Cotisations ...............   3 000,00 $",
  "Rendement net .............     750,00 $",
  "Solde de cloture .......... 118 000,00 $",
  "",
  "Document fictif genere pour la demonstration CoAdvisor.",
].join("\n");

async function main() {
  const envReport: string[] = [];

  // 0. Repères : tenant, conseillère, dossier client.
  const rep = await withSystemContext(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { slug: DEMO_TENANT_SLUG },
    });
    const advisor = await tx.user.findUnique({
      where: { email: ADVISOR_EMAIL },
    });
    const membership = advisor
      ? await tx.tenantUser.findFirst({
          where: { tenantId: tenant?.id ?? "", userId: advisor.id },
        })
      : null;
    const client = await tx.client.findFirst({
      where: { email: CLIENT_EMAIL },
    });
    return { tenant, advisor, membership, client };
  });
  if (!rep.tenant || !rep.advisor || !rep.membership || !rep.client) {
    console.error(
      "Cabinet démo introuvable — lancez d'abord : pnpm db:migrate && pnpm db:seed",
    );
    process.exitCode = 1;
    return;
  }
  const actor: DocumentsActor = {
    tenantId: rep.tenant.id,
    userId: rep.advisor.id,
    role: rep.membership.role,
  };
  const jean = rep.client;

  // 1. Calcul FHI authentique (snapshot) si aucun n'existe encore.
  const assessmentCount = await withSystemContext((tx) =>
    tx.healthAssessment.count({ where: { clientId: jean.id } }),
  );
  if (assessmentCount === 0) {
    await calculateFhi(actor, jean.id, META);
    envReport.push("Indice de santé financière calculé (snapshot authentique)");
  }

  // 2. Comptes portail du couple (vrai flux d'inscription).
  const ensurePortalAccount = async (
    firstName: string,
    lastName: string,
    email: string,
  ) => {
    let account = await withSystemContext((tx) =>
      tx.user.findUnique({ where: { email } }),
    );
    if (!account) {
      await signupIndividual({
        firstName,
        lastName,
        email,
        password: DEMO_PASSWORD,
      });
      account = await withSystemContext((tx) =>
        tx.user.findUnique({ where: { email } }),
      );
      envReport.push(`Compte portail créé : ${email} / ${DEMO_PASSWORD}`);
    }
    return account!;
  };
  const jeanAccount = await ensurePortalAccount(
    "Jean",
    "Bouchard",
    CLIENT_EMAIL,
  );
  const sophieAccount = await ensurePortalAccount(
    "Sophie",
    "Bouchard",
    SPOUSE_EMAIL,
  );

  // 3. Liens portail ACTIFS (couple — deux invitations indépendantes).
  const links = await listPortalLinksForClient(actor, jean.id);
  const ensureActiveLink = async (userId: string, name: string) => {
    const active = links.some(
      (link) => link.userId === userId && link.status === "ACTIVE",
    );
    if (!active) {
      const invite = await createPortalInvite(actor, jean.id, META);
      await claimPortalInvite(userId, invite.code);
      envReport.push(
        `Lien portail activé pour ${name} (invitation + consentement Loi 25)`,
      );
    }
  };
  await ensureActiveLink(jeanAccount.id, "Jean");
  await ensureActiveLink(sophieAccount.id, "Sophie (conjointe)");

  // 3b. Fiche CRM de Sophie + lien inter-clients certifié CONJOINT (7c) —
  //     navigation croisée cliquable entre les deux dossiers.
  let sophie = await withSystemContext((tx) =>
    tx.client.findFirst({ where: { email: SPOUSE_EMAIL } }),
  );
  if (!sophie) {
    sophie = await createClient(
      {
        firstName: "Sophie",
        lastName: "Bouchard",
        type: "INDIVIDUAL",
        email: SPOUSE_EMAIL,
        birthDate: new Date("1980-09-30T00:00:00.000Z"),
      },
      actor,
      META,
    );
    envReport.push("Fiche client de Sophie Bouchard créée (conjuguée à Jean)");
  }
  const existingLinks = await listClientLinks(actor, jean.id);
  if (!existingLinks.some((link) => link.otherClientId === sophie.id)) {
    await createClientLink(
      actor,
      jean.id,
      {
        otherClientId: sophie.id,
        type: "CONJOINT",
        note: "Couple — planification retraite conjointe (comptes à consolider)",
      },
      META,
    );
    envReport.push(
      "Lien certifié CONJOINT Jean ↔ Sophie — cliquable des deux côtés",
    );
  }

  // 4. Pièces au coffre (idempotent, repérage par libellé).
  //    Les exemplaires « copie d'enveloppe » (libellé identique au document
  //    source, par design) sont exclus du repérage — sinon, au premier refus
  //    ou à la première signature complète, la nouvelle copie masque
  //    l'original (tri création desc) et l'idempotence casse.
  const isEnvelopeCopy = (row: { document: { originalFilename: string } }) =>
    row.document.originalFilename.startsWith("enveloppe-");
  const docs = await listClientDocuments(actor, jean.id);
  const byLabel = (prefix: string) =>
    docs.find(
      (row) => !isEnvelopeCopy(row) && row.document.label.startsWith(prefix),
    );

  if (!byLabel("Relevé REER")) {
    const buffer = Buffer.from(RELEVE_TEXT, "utf8");
    await uploadDocument(
      jean.id,
      { label: "Relevé REER — Banque Démo (spécimen)", category: "RELEVE" },
      {
        fileName: "releve-reer-banque-demo.txt",
        declaredMime: "text/plain",
        declaredSize: buffer.length,
        stream: Readable.from(buffer),
      },
      actor,
      META,
    );
    envReport.push("Relevé REER déposé au coffre (chiffré AES-256-GCM)");
  }

  // Mandat 1 page (Sprint 7) — conservé tel quel pour l'historique.
  if (!byLabel("Mandat de planification")) {
    const pdf = await buildMandatPdf();
    await uploadDocument(
      jean.id,
      {
        label: "Mandat de planification financière",
        category: "CONTRAT",
      },
      {
        fileName: "mandat-planification-demo.pdf",
        declaredMime: "application/pdf",
        declaredSize: pdf.length,
        stream: Readable.from(pdf),
      },
      actor,
      META,
    );
    envReport.push("Mandat (PDF) déposé au coffre");
  }

  // Entente 3 pages (Sprint 7b) — pièce support de l'enveloppe d'essai.
  if (!byLabel("Entente de services-conseils")) {
    const pdf = await buildEntentePdf();
    await uploadDocument(
      jean.id,
      {
        label: "Entente de services-conseils (spécimen 7b)",
        category: "CONTRAT",
      },
      {
        fileName: "entente-services-conseils-demo.pdf",
        declaredMime: "application/pdf",
        declaredSize: pdf.length,
        stream: Readable.from(pdf),
      },
      actor,
      META,
    );
    envReport.push("Entente de services-conseils (3 pages) déposée au coffre");
  }

  // 5. Enveloppe multi-signataires SÉQUENTIELLE sur l'entente (7b) :
  //    Jean → Sophie → Marie (cabinet) → notaire externe, avec paraphes.
  const refreshed = (await listClientDocuments(actor, jean.id)).filter(
    (row) => !isEnvelopeCopy(row),
  );
  const ententeRow = refreshed.find((row) =>
    row.document.label.startsWith("Entente de services-conseils"),
  );
  if (
    ententeRow &&
    !ententeRow.signatures.some((signature) =>
      ["REQUESTED", "PARTIALLY_SIGNED", "SIGNED"].includes(signature.status),
    )
  ) {
    const { externalLinks } = await createEnvelope(
      actor,
      ententeRow.document.id,
      {
        signers: [
          { kind: "PORTAL_USER", portalUserId: jeanAccount.id },
          { kind: "PORTAL_USER", portalUserId: sophieAccount.id },
          { kind: "STAFF", staffUserId: rep.advisor.id },
          {
            kind: "EXTERNAL",
            email: NOTARY_EMAIL,
            fullName: "Me Karine Legal",
          },
        ],
        signingMode: "SEQUENTIAL",
        message:
          "Bonjour — merci de parapher les pages 1 et 2, puis de signer en page 3.",
        expiresInDays: 30,
        saveTemplateAs: "Entente couple + cabinet + externe",
        fields: [
          // Paraphes (usage québécois) — pages 1 et 2.
          { signerIndex: 0, kind: "INITIALS", pageIndex: 0, x: 0.05, y: 0.9, width: 0.14, height: 0.045 },
          { signerIndex: 1, kind: "INITIALS", pageIndex: 0, x: 0.81, y: 0.9, width: 0.14, height: 0.045 },
          { signerIndex: 0, kind: "INITIALS", pageIndex: 1, x: 0.05, y: 0.9, width: 0.14, height: 0.045 },
          { signerIndex: 1, kind: "INITIALS", pageIndex: 1, x: 0.81, y: 0.9, width: 0.14, height: 0.045 },
          // Signatures — page 3 : sous chaque libellé tracé explicitement
          // (noms à y=632/632/502/372-356 pt, origine bas-gauche).
          { signerIndex: 0, kind: "SIGNATURE", pageIndex: 2, x: 0.07, y: 0.27, width: 0.38, height: 0.075 },
          { signerIndex: 0, kind: "DATE", pageIndex: 2, x: 0.07, y: 0.355, width: 0.24, height: 0.04 },
          { signerIndex: 1, kind: "SIGNATURE", pageIndex: 2, x: 0.55, y: 0.27, width: 0.38, height: 0.075 },
          { signerIndex: 1, kind: "DATE", pageIndex: 2, x: 0.55, y: 0.355, width: 0.24, height: 0.04 },
          { signerIndex: 2, kind: "SIGNATURE", pageIndex: 2, x: 0.07, y: 0.42, width: 0.38, height: 0.075 },
          { signerIndex: 2, kind: "DATE", pageIndex: 2, x: 0.07, y: 0.5, width: 0.24, height: 0.04 },
          { signerIndex: 3, kind: "SIGNATURE", pageIndex: 2, x: 0.07, y: 0.6, width: 0.38, height: 0.075 },
          { signerIndex: 3, kind: "DATE", pageIndex: 2, x: 0.07, y: 0.68, width: 0.24, height: 0.04 },
        ],
      },
      META,
    );
    envReport.push(
      "Enveloppe séquentielle créée : Jean → Sophie → Marie (cabinet) → Me Karine Legal (externe)",
    );
    for (const link of externalLinks) {
      envReport.push(`LIEN EXTERNE (${link.fullName}) : ${link.url}`);
    }
  }

  // 5b. Scénario « refus → nouvel envoi » (Sprint 7c, correctif 1) sur le
  //     mandat 1 page : Jean refuse la première demande (la ronde se clôt,
  //     copie constatant le refus déposée au coffre), puis le cabinet relance
  //     un NOUVEL ENVOI en un geste — sans tout reconfigurer.
  const mandatRow = refreshed.find((row) =>
    row.document.label.startsWith("Mandat de planification"),
  );
  if (mandatRow) {
    const mandatEnvelopes = await listDocumentEnvelopes(
      actor,
      mandatRow.document.id,
    );
    const hasDeclined = mandatEnvelopes.some((e) => e.status === "DECLINED");
    const hasLive = mandatEnvelopes.some((e) =>
      ["REQUESTED", "PARTIALLY_SIGNED"].includes(e.status),
    );
    if (!hasDeclined && !hasLive) {
      const { envelopeId } = await createEnvelope(
        actor,
        mandatRow.document.id,
        {
          signers: [{ kind: "PORTAL_USER", portalUserId: jeanAccount.id }],
          signingMode: "PARALLEL",
          message:
            "Bonjour Jean — veuillez signer ce mandat de planification avant notre rencontre.",
          expiresInDays: 14,
          fields: [
            { signerIndex: 0, kind: "SIGNATURE", pageIndex: 0, x: 0.07, y: 0.6, width: 0.38, height: 0.075 },
            { signerIndex: 0, kind: "DATE", pageIndex: 0, x: 0.55, y: 0.6, width: 0.24, height: 0.04 },
          ],
        },
        META,
      );
      const row = (
        await listDocumentEnvelopes(actor, mandatRow.document.id)
      ).find((e) => e.id === envelopeId);
      const jeanSigner = row?.signers.find(
        (s) => s.kind === "PORTAL_USER" && s.userId === jeanAccount.id,
      );
      if (jeanSigner) {
        await declineAsPortalUser(
          jeanAccount.id,
          jeanSigner.id,
          {
            reason:
              "Le paragraphe sur l'étendue du mandat doit être précisé avant que je signe.",
          },
          META,
        );
        const resent = await resendEnvelope(actor, envelopeId, {}, META);
        envReport.push(
          `Refus démontré : mandat refusé par Jean (copie constatant le refus au coffre) → nouvel envoi ${resent.envelopeId.slice(0, 8)}… en circulation`,
        );
      }
    }
  }

  // 6. Partages portail : relevé (l'enveloppe, elle, donne déjà lecture).
  const releveRow = refreshed.find((row) =>
    row.document.label.startsWith("Relevé REER"),
  );
  if (
    releveRow &&
    !releveRow.shares.some(
      (s) => s.channel === "PORTAL" && s.revokedAt === null,
    )
  ) {
    await shareToPortal(actor, releveRow.document.id, META);
    envReport.push(`« ${releveRow.document.label} » partagé au portail`);
  }

  // 7. Bilan FHI (PDF serveur) généré puis partagé au portail.
  const fhiRow = refreshed.find((row) =>
    row.document.label.startsWith("Bilan santé financière"),
  );
  if (!fhiRow) {
    const report = await generateReport("FHI", actor, jean.id, META);
    await shareToPortal(actor, report.id, META);
    envReport.push("Bilan santé financière (PDF) généré et partagé au portail");
  } else if (
    !fhiRow.shares.some((s) => s.channel === "PORTAL" && s.revokedAt === null)
  ) {
    await shareToPortal(actor, fhiRow.document.id, META);
    envReport.push("Bilan santé financière partagé au portail");
  }

  // Sprint 8 — photo marketplace au coffre
  {
    const photoLine = await withSystemContext((sysTx) =>
      seedAdvisorVaultPhoto(sysTx, rep.tenant.id, rep.advisor.id),
    );
    if (photoLine) envReport.push(photoLine);
  }

  if (envReport.length === 0) {
    console.log("Démo Sprint 7/7b/7c déjà en place — rien à faire.");
  } else {
    console.log("✔ Démo Sprint 7/7b/7c appliquée :");
    for (const line of envReport) {
      console.log(`   - ${line}`);
    }
    console.log("");
    console.log("Déroulé suggéré (enveloppe séquentielle) :");
    console.log("   1. Portail Jean (jean.bouchard@exemple.ca) → ouvrir et signer");
    console.log("   2. Portail Sophie (sophie.bouchard@exemple.ca) → ouvrir et signer");
    console.log("   3. Espace conseiller demo@coadvisor.ca → /signatures → contre-signer");
    console.log("   4. Lien externe imprimé ci-dessus → Me Karine Legal signe");
    console.log("   → copie signée + certificat déposés au coffre et partagés");
    console.log("");
    console.log("Déroulé suggéré (refus, Sprint 7c) :");
    console.log("   · Coffre de Jean → « Mandat de planification » : enveloppe REFUSÉE");
    console.log("     (copie constatant le refus téléchargeable) + nouvel envoi en cours.");
    console.log("   · Fiches Jean ↔ Sophie : lien certifié CONJOINT cliquable (7c).");
  }
}

main()
  .catch((error) => {
    console.error("Échec du seed démo documents :", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
