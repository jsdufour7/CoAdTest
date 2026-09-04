import { z } from "zod";

import { DOCUMENT_CATEGORIES } from "../labels";

// ─── Domaine signature → @coadvisor/signdoc (Sprint 7c, ADR-012) ───
// Ré-exportés ici pour compatibilité des importations existantes.
export {
  envelopeCreateSchema,
  envelopeResendSchema,
  envelopeSignerSchema,
  signatureDeclineSchema,
  signatureFieldSchema,
  signatureSubmitSchema,
  signatureTemplateSaveSchema,
  typedNameSchema,
} from "@coadvisor/signdoc";

/** Métadonnées d'un dépôt (le binaire arrive en flux à part). */
export const uploadMetaSchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, "Le libellé doit contenir au moins 3 caractères.")
    .max(120, "Le libellé ne peut pas dépasser 120 caractères."),
  category: z.enum(DOCUMENT_CATEGORIES, {
    message: "Catégorie de document invalide.",
  }),
});
