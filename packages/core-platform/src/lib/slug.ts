import { randomBytes } from "node:crypto";

/** Slug URL-safe à partir d'un nom d'organisation (accents normalisés). */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "cabinet";
}

/** Slug unique garanti : base lisible + suffixe aléatoire. */
export function uniqueSlug(name: string): string {
  return `${slugify(name)}-${randomBytes(3).toString("hex")}`;
}
