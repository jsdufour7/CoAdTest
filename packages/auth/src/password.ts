import argon2 from "argon2";

/**
 * Politique de mots de passe (Sprint 1).
 * Messages en français : affichés directement à l'utilisateur.
 */
export const PASSWORD_POLICY = {
  minLength: 12,
  requireLowercase: true,
  requireUppercase: true,
  requireDigit: true,
} as const;

export function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(
      `Le mot de passe doit contenir au moins ${PASSWORD_POLICY.minLength} caractères.`,
    );
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Le mot de passe doit contenir une lettre minuscule.");
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Le mot de passe doit contenir une lettre majuscule.");
  }
  if (PASSWORD_POLICY.requireDigit && !/[0-9]/.test(password)) {
    errors.push("Le mot de passe doit contenir un chiffre.");
  }
  return errors;
}

const DEFAULT_OPTIONS: argon2.Options = { type: argon2.argon2id };

export function hashPassword(
  password: string,
  options: argon2.Options = DEFAULT_OPTIONS,
): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
