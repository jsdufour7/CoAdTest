import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Configuration ESLint de base du monorepo CoAdvisor.
 * Règles volontairement sobres au Sprint 1; durcissement prévu
 * (plugins next/react) dans un sprint ultérieur.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.config.{js,mjs,ts}",
      // Fichiers auto-générés (Next.js, Prisma)
      "**/next-env.d.ts",
      "**/generated/**",
      // Binaire « vendor » : worker pdf.js copié tel quel depuis
      // pdfjs-dist (nécessaire au rendu PDF côté navigateur — 7b).
      "**/pdf.worker.min.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Convention TS : préfixe « _ » = placeholder intentionnel
      // (ex. _prevState des server actions React 19).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
