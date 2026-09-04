import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { ValidationError } from "@coadvisor/types";

import {
  DEFAULT_SIGNATURE_STYLE_ID,
  readStyleFontBytes,
  resolveSignatureStyle,
  signatureStampId,
} from "./styles";

/**
 * Estampillage des champs de signature (Sprint 7c — sigstamp-2.0) :
 * vignette « façon DocuSign » — cadre à coins arrondis, mention
 * « Signé par : » en cartouche, nom dans LA POLICE ADOPTÉE par le
 * signataire (styles OFL embarqués via fontkit) ou signature tracée,
 * et identifiant d'apposition probant en pied de vignette. Les champs
 * d'un signataire ayant REFUSÉ portent le marqueur de refus (le
 * certificat fusionné en fin de document consigne le motif).
 *
 * Coordonnées persistées : normalisées (0-1), origine HAUT-GAUCHE
 * (comme l'écran). pdf-lib travaille en points, origine BAS-GAUCHE.
 */
export const STAMP_ENGINE_VERSION = "sigstamp-2.0";

/** Encre Signdoc (marine quasi-noire) et teintes de la vignette. */
const INK = rgb(0.05, 0.1, 0.24);
const FRAME = rgb(0.16, 0.32, 0.58);
const LABEL = rgb(0.42, 0.48, 0.6);
const DECLINE = rgb(0.6, 0.14, 0.14);
const BOX_FILL = rgb(1, 1, 1);

export interface StampSignerEntry {
  /** Index du signataire dans l'enveloppe (ordre). */
  index: number;
  typedName: string;
  initials: string;
  /** Style adopté à l'adoption (registre styles.ts). */
  styleId?: string | null;
  /** SIGNED par défaut; DECLINED → marqueur de refus sur ses champs. */
  status?: "SIGNED" | "DECLINED";
  signedAt?: Date | null;
  declinedAt?: Date | null;
  /** PNG de la signature tracée (bytes), si fournie. */
  drawnPng?: Uint8Array | null;
  /** Identifiant DB du signataire — base de l'ID d'apposition. */
  signerId?: string;
}

export interface StampFieldPlacement {
  signerIndex: number;
  kind: "SIGNATURE" | "INITIALS" | "DATE";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** « Jean Bouchard » → « J.B. » — îlot pur partagé client-serveur. */
export { deriveInitials } from "./pure";

const DATE_STAMP_FORMAT = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_ONLY_FORMAT = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
});

function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startingSize: number,
): number {
  let size = startingSize;
  while (size > 5) {
    const width = font.widthOfTextAtSize(text, size);
    if (width <= maxWidth && size <= maxHeight) return size;
    size -= 0.5;
  }
  return Math.max(5, size);
}



/**
 * Estampille toutes les vignettes et retourne le PDF résultant. Les
 * champs d'un signataire PENDING (ni signé ni refusé) sont ignorés —
 * garde-fou métier en amont dans le service.
 */
export async function stampSignatureFields(
  originalBytes: Uint8Array,
  signers: StampSignerEntry[],
  fields: StampFieldPlacement[],
  options: { envelopeId?: string } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(originalBytes, {
    ignoreEncryption: true,
  });
  pdf.registerFontkit(fontkit);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fallbackScript = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  // Polices script par signataire — embarquage TTF via fontkit avec
  // repli gracieux (jamais bloquant pour une pièce justificative).
  const scriptFonts = new Map<number, PDFFont>();
  for (const signer of signers) {
    if (scriptFonts.has(signer.index)) continue;
    const { style } = resolveSignatureStyle(
      signer.styleId ?? DEFAULT_SIGNATURE_STYLE_ID,
    );
    let font = fallbackScript;
    const ttf = readStyleFontBytes(style);
    if (ttf) {
      try {
        font = await pdf.embedFont(await ttf, { subset: true });
      } catch {
        font = fallbackScript; // TTF illisible → repli, preuve préservée
      }
    }
    scriptFonts.set(signer.index, font);
  }

  const drawnByIndex = new Map<
    number,
    Awaited<ReturnType<typeof pdf.embedPng>>
  >();
  for (const signer of signers) {
    if (signer.drawnPng && !drawnByIndex.has(signer.index)) {
      try {
        drawnByIndex.set(signer.index, await pdf.embedPng(signer.drawnPng));
      } catch {
        throw new ValidationError(
          "La signature tracée reçue n'est pas un PNG valide — recommencez la signature.",
        );
      }
    }
  }

  const pages = pdf.getPages();
  const bySigner = new Map(signers.map((signer) => [signer.index, signer]));

  for (const field of fields) {
    const signer = bySigner.get(field.signerIndex);
    if (!signer) continue;
    const page: PDFPage | undefined = pages[field.pageIndex];
    if (!page) {
      throw new ValidationError(
        `Le champ placé en page ${field.pageIndex + 1} dépasse le nombre de pages du document.`,
      );
    }
    const declined = signer.status === "DECLINED";
    // Sur refus, aucune date n'a été « signée » : la vignette de refus ne
    // s'appose que sur les zones Signature/Paraphe — le champ DATE reste vierge.
    if (declined && field.kind === "DATE") {
      continue;
    }
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const x = field.x * pageWidth;
    const boxWidth = Math.max(24, field.width * pageWidth);
    const boxHeight = Math.max(12, field.height * pageHeight);
    // Origine pdf-lib = bas-gauche ; la zone écran part du haut.
    const y = (1 - field.y) * pageHeight - boxHeight;
    const frameColor = declined ? DECLINE : FRAME;

    // Cadre « façon DocuSign » (fond blanc quasi opaque) — drawRectangle :
    // rendu garanti partout (drawSvgPath s'avérait silencieusement ignoré
    // pour la bordure sur plusieurs visionneuses).
    page.drawRectangle({
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      color: BOX_FILL,
      opacity: 0.92,
      borderColor: frameColor,
      borderWidth: 1,
      borderOpacity: 0.9,
    });

    if (declined) {
      // Marqueur de refus — le refus est une FIN de ronde : il est
      // constaté sur la pièce ET détaillé au certificat fusionné.
      const nameSize = fitFontSize(
        bold,
        `Refusé — ${signer.typedName}`,
        boxWidth - 8,
        boxHeight * 0.4,
        9,
      );
      page.drawText(`Refusé — ${signer.typedName}`, {
        x: x + 4,
        y: y + boxHeight * 0.52,
        size: nameSize,
        font: bold,
        color: DECLINE,
      });
      const when = DATE_ONLY_FORMAT.format(signer.declinedAt ?? new Date());
      const whenSize = fitFontSize(regular, when, boxWidth - 8, boxHeight * 0.3, 7);
      page.drawText(when, {
        x: x + 4,
        y: y + boxHeight * 0.14,
        size: whenSize,
        font: regular,
        color: DECLINE,
      });
      // Trait diagonal discret : le geste « annulé » saute aux yeux.
      page.drawLine({
        start: { x: x + 3, y: y + 4 },
        end: { x: x + boxWidth - 3, y: y + boxHeight - 4 },
        thickness: 0.6,
        color: DECLINE,
        opacity: 0.35,
      });
      continue;
    }

    if (field.kind === "SIGNATURE") {
      const label = "Signé par :";
      const labelSize = Math.min(6.5, Math.max(4, boxHeight * 0.16));
      page.drawText(label, {
        x: x + 4,
        y: y + boxHeight - labelSize - 2,
        size: labelSize,
        font: regular,
        color: LABEL,
      });

      const stampId = signatureStampId(
        signer.signerId ?? `idx-${signer.index}`,
        options.envelopeId ?? "apercu",
      );
      const idText = `ID : ${stampId}`;
      const idSize = Math.min(5.5, Math.max(4, boxHeight * 0.13));
      page.drawText(idText, {
        x: x + 4,
        y: y + 2,
        size: idSize,
        font: regular,
        color: LABEL,
      });

      const drawn = drawnByIndex.get(field.signerIndex);
      if (drawn) {
        const bandTop = y + boxHeight - labelSize - 4;
        const bandBottom = y + idSize + 4;
        const bandHeight = Math.max(8, bandTop - bandBottom);
        const scale = Math.min(
          (boxWidth - 8) / drawn.width,
          bandHeight / drawn.height,
        );
        const drawnWidth = drawn.width * scale;
        const drawnHeight = drawn.height * scale;
        page.drawImage(drawn, {
          x: x + (boxWidth - drawnWidth) / 2,
          y: bandBottom + (bandHeight - drawnHeight) / 2,
          width: drawnWidth,
          height: drawnHeight,
        });
      } else {
        const script = scriptFonts.get(field.signerIndex) ?? fallbackScript;
        const nameSize = fitFontSize(
          script,
          signer.typedName,
          boxWidth - 10,
          boxHeight * 0.5,
          20,
        );
        const nameWidth = script.widthOfTextAtSize(signer.typedName, nameSize);
        page.drawText(signer.typedName, {
          x: x + Math.max(4, (boxWidth - nameWidth) / 2),
          y: y + boxHeight * 0.3,
          size: nameSize,
          font: script,
          color: INK,
        });
      }
    } else if (field.kind === "INITIALS") {
      const script = scriptFonts.get(field.signerIndex) ?? fallbackScript;
      const size = fitFontSize(
        script,
        signer.initials,
        boxWidth - 6,
        boxHeight * 0.72,
        16,
      );
      const textWidth = script.widthOfTextAtSize(signer.initials, size);
      page.drawText(signer.initials, {
        x: x + Math.max(3, (boxWidth - textWidth) / 2),
        y: y + boxHeight * 0.3,
        size,
        font: script,
        color: INK,
      });
    } else {
      const dateText = DATE_STAMP_FORMAT.format(signer.signedAt ?? new Date());
      const size = fitFontSize(
        regular,
        dateText,
        boxWidth - 6,
        boxHeight * 0.55,
        9,
      );
      page.drawText(dateText, {
        x: x + 4,
        y: y + boxHeight * 0.3,
        size,
        font: regular,
        color: INK,
      });
    }
  }

  return pdf.save({ useObjectStreams: false });
}
