import { z } from "zod";

/**
 * Schémas d'entrée de l'API Signdoc — ILS SONT le contrat public :
 * les routes REST futures valideront avec ces mêmes schémas (ADR-012).
 * Messages de validation 100 % français (règle produit).
 */

export const typedNameSchema = z
  .string()
  .trim()
  .min(2, "Tapez votre nom complet (au moins 2 caractères).")
  .max(120, "Le nom ne peut pas dépasser 120 caractères.");

const emailSchema = z
  .string()
  .trim()
  .email("Ce courriel semble invalide.")
  .max(254, "Le courriel ne peut pas dépasser 254 caractères.");

const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Le nom complet doit contenir au moins 2 caractères.")
  .max(120, "Le nom ne peut pas dépasser 120 caractères.");

/** Un signataire de l'enveloppe (discriminé par canal). */
export const envelopeSignerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PORTAL_USER"),
    /** Utilisateur titulaire d'un lien portail ACTIVE sur le dossier. */
    portalUserId: z.string().uuid("Lien portail invalide."),
  }),
  z.object({
    kind: z.literal("STAFF"),
    /** Membre du cabinet (contre-signature dans l'app conseiller). */
    staffUserId: z.string().uuid("Membre du cabinet invalide."),
  }),
  z.object({
    kind: z.literal("EXTERNAL"),
    email: emailSchema,
    fullName: fullNameSchema,
  }),
]);

/** Champ positionné — coordonnées normalisées (0-1, origine haut-gauche). */
export const signatureFieldSchema = z.object({
  /** Index du signataire dans le tableau `signers` (0..n-1). */
  signerIndex: z
    .number()
    .int("L'index de signataire doit être un entier.")
    .min(0, "L'index de signataire est invalide."),
  kind: z.enum(["SIGNATURE", "INITIALS", "DATE"], {
    message: "Type de champ invalide.",
  }),
  pageIndex: z
    .number()
    .int("La page doit être un entier.")
    .min(0, "La page est invalide.")
    .max(499, "La page dépasse la limite prise en charge."),
  x: z.number().min(0, "Position X invalide.").max(1, "Position X invalide."),
  y: z.number().min(0, "Position Y invalide.").max(1, "Position Y invalide."),
  width: z
    .number()
    .gt(0.01, "La zone est trop étroite.")
    .max(1, "La zone dépasse la page."),
  height: z
    .number()
    .gt(0.01, "La zone est trop courte.")
    .max(1, "La zone dépasse la page."),
});

export const envelopeCreateSchema = z
  .object({
    signers: z
      .array(envelopeSignerSchema)
      .min(1, "Ajoutez au moins un signataire.")
      .max(6, "Une enveloppe accepte au plus 6 signataires."),
    signingMode: z.enum(["SEQUENTIAL", "PARALLEL"], {
      message: "Ordre de signature invalide.",
    }),
    message: z
      .string()
      .trim()
      .max(500, "Le mot aux signataires ne peut pas dépasser 500 caractères.")
      .optional(),
    expiresInDays: z
      .number()
      .int("L'échéance doit être un nombre entier de jours.")
      .min(1, "L'échéance minimale est de 1 jour.")
      .max(90, "L'échéance maximale est de 90 jours."),
    fields: z
      .array(signatureFieldSchema)
      .min(1, "Placez au moins un champ de signature sur le document.")
      .max(60, "Trop de champs — allégez la mise en page."),
    /** Gabarit à enregistrer sous ce nom après création (facultatif). */
    saveTemplateAs: z
      .string()
      .trim()
      .min(3, "Le nom du gabarit doit contenir au moins 3 caractères.")
      .max(80, "Le nom du gabarit ne peut pas dépasser 80 caractères.")
      .optional(),
  })
  .superRefine((value, ctx) => {
    // Chaque champ doit référencer un signataire existant.
    for (const field of value.fields) {
      if (field.signerIndex >= value.signers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Un champ est assigné à un signataire inexistant.",
        });
        return;
      }
    }
    // Chaque signataire a au moins un champ SIGNATURE (comme DocuSign).
    value.signers.forEach((signer, index) => {
      const hasSignature = value.fields.some(
        (field) => field.signerIndex === index && field.kind === "SIGNATURE",
      );
      if (!hasSignature) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Chaque signataire doit avoir au moins une zone « Signature » sur le document.",
        });
      }
    });
    // Zones contenues dans la page.
    for (const field of value.fields) {
      if (field.x + field.width > 1.000_001 || field.y + field.height > 1.000_001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Une zone déborde de la page — repositionnez-la.",
        });
        return;
      }
    }
  });

/** « Nouvel envoi » (Sprint 7c) — clone d'une enveloppe close. */
export const envelopeResendSchema = z.object({
  message: z
    .string()
    .trim()
    .max(500, "Le mot aux signataires ne peut pas dépasser 500 caractères.")
    .optional(),
  expiresInDays: z
    .number()
    .int("L'échéance doit être un nombre entier de jours.")
    .min(1, "L'échéance minimale est de 1 jour.")
    .max(90, "L'échéance maximale est de 90 jours.")
    .optional(),
});

/** Soumission de signature (tous canaux) : nom tapé + consentement. */
export const signatureSubmitSchema = z.object({
  signerName: typedNameSchema,
  initials: z
    .string()
    .trim()
    .min(1, "Vos initiales sont requises pour les paraphes.")
    .max(8, "Les initiales ne peuvent pas dépasser 8 caractères.")
    .optional(),
  /** Style adopté « façon DocuSign » (registre styles.ts). */
  signatureStyle: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/, "Style de signature invalide.")
    .optional(),
  /** PNG « data:image/png;base64,… » de la signature tracée (optionnel). */
  drawnPngDataUrl: z
    .string()
    .max(400_000, "La signature tracée est trop lourde — recommencez plus simplement.")
    .optional(),
});

export const signatureDeclineSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Expliquez en quelques mots la raison du refus (10 caractères minimum).")
    .max(500, "Le motif ne peut pas dépasser 500 caractères."),
});

export const signatureTemplateSaveSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Le nom du gabarit doit contenir au moins 3 caractères.")
    .max(80, "Le nom du gabarit ne peut pas dépasser 80 caractères."),
  fields: z
    .array(signatureFieldSchema)
    .min(1, "Le gabarit doit contenir au moins un champ.")
    .max(60, "Le gabarit contient trop de champs."),
});
