import { z } from "zod";

/** Entrée du parcours « Créer mon espace » (critère de succès Sprint 1). */
export const bootstrapCabinetSchema = z.object({
  firmName: z
    .string()
    .trim()
    .min(2, "Le nom du cabinet est requis (min. 2 caractères).")
    .max(120),
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(80),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Courriel invalide.")
    .max(160),
  password: z.string().min(1, "Mot de passe requis."),
});

export type BootstrapCabinetInput = z.infer<typeof bootstrapCabinetSchema>;

/** Entrée du parcours « Inviter un membre » (rôles back-office). */
export const inviteMemberSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(80),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Courriel invalide.")
    .max(160),
  role: z.enum(["ADVISOR", "ASSISTANT", "COMPLIANCE_OFFICER"]),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
