import { z } from "zod";

/** Accepte "" comme « absent » (champs de formulaire facultatifs). */
const optionalDate = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.date().optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

// ── Clients (FR-CRM-001) ─────────────────────────────────────
export const createClientSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(80),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(80),
  type: z.enum(["INDIVIDUAL", "FAMILY", "CORPORATE"]),
  email: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().toLowerCase().email("Courriel invalide.").max(160).optional(),
  ),
  phone: optionalText(40),
  birthDate: optionalDate,
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const clientSearchSchema = z.object({
  q: optionalText(100),
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["PROSPECT", "ACTIVE", "ARCHIVED"]).optional(),
  ),
});
export type ClientSearchInput = z.infer<typeof clientSearchSchema>;

// ── Famille ──────────────────────────────────────────────────
export const addFamilyMemberSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(80),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(80),
  role: z.enum(["SPOUSE", "CHILD", "PARENT", "DEPENDENT", "OTHER"]),
  birthDate: optionalDate,
  notes: optionalText(1000),
});
export type AddFamilyMemberInput = z.infer<typeof addFamilyMemberSchema>;

// ── Notes ────────────────────────────────────────────────────
export const addNoteSchema = z.object({
  content: z.string().trim().min(1, "La note est requise.").max(10_000),
  type: z.enum(["MEETING", "PHONE", "EMAIL", "OBSERVATION", "TASK"]),
});
export type AddNoteInput = z.infer<typeof addNoteSchema>;

// ── Tâches ───────────────────────────────────────────────────
export const addTaskSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis.").max(200),
  description: optionalText(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: optionalDate,
});
export type AddTaskInput = z.infer<typeof addTaskSchema>;
