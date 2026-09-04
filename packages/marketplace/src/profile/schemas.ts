import { z } from "zod";

import { MARKETPLACE_LANGUAGES, MARKETPLACE_SPECIALTIES } from "../match/specialties";

/**
 * Photo de profil encodée en data URL (cap 450 Ko — stockage fichier
 * prévu au Sprint 7 module Documents, migration prévue à l'ADR-009).
 */
export const PHOTO_DATA_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export const PHOTO_DATA_MAX_LENGTH = 600_000; // ~450 Ko encodé base64

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maximum ${max} caractères.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

/** Saisie « Mon profil public » (espace conseiller). */
export const profileInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Le nom public est requis (2 caractères minimum).")
    .max(80, "Maximum 80 caractères."),
  headline: optionalText(120),
  bio: z
    .string()
    .trim()
    .min(40, "Présentez votre approche en quelques phrases (40 caractères minimum).")
    .max(1200, "Maximum 1200 caractères."),
  regions: z
    .array(z.string().trim().min(2, "Région invalide.").max(60, "Maximum 60 caractères."))
    .min(1, "Au moins une région desservie est requise.")
    .max(6, "Maximum 6 régions."),
  languages: z
    .array(z.enum(MARKETPLACE_LANGUAGES))
    .min(1, "Au moins une langue parlée est requise.")
    .max(2),
  specialties: z
    .array(z.enum(MARKETPLACE_SPECIALTIES))
    .min(1, "Choisissez au moins une spécialité.")
    .max(6),
  yearsExperience: z
    .number()
    .int("Nombre d'années entier requis.")
    .min(0, "Les années d'expérience ne peuvent être négatives.")
    .max(60, "Maximum 60 ans.")
    .nullable()
    .optional(),
  credentialsText: optionalText(300),
  photoData: z
    .string()
    .regex(PHOTO_DATA_PATTERN, "Format d'image non pris en charge (PNG ou JPEG).")
    .max(PHOTO_DATA_MAX_LENGTH, "Image trop lourde (maximum 450 Ko).")
    .nullable()
    .optional(),
  /** Retrait explicite de la photo (Sprint 8 — coffre). */
  removePhoto: z.boolean().optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Demande de contact publique (prospect → conseiller). */
export const contactRequestSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Votre prénom est requis.")
    .max(80, "Maximum 80 caractères."),
  lastName: z
    .string()
    .trim()
    .min(2, "Votre nom est requis.")
    .max(80, "Maximum 80 caractères."),
  email: z
    .string()
    .trim()
    .email("Courriel invalide.")
    .max(190, "Maximum 190 caractères."),
  phone: optionalText(30),
  message: z
    .string()
    .trim()
    .min(20, "Décrivez votre besoin en quelques phrases (20 caractères minimum).")
    .max(1000, "Maximum 1000 caractères."),
  consent: z.literal(true, {
    errorMap: () => ({
      message: "Le consentement est requis pour transmettre votre demande (Loi 25).",
    }),
  }),
});
export type ContactRequestInput = z.infer<typeof contactRequestSchema>;
