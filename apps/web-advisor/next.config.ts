import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Monorepo — source unique de vérité : le `.env` à la racine du repo.
// (Next.js ne charge par défaut que le .env du dossier de l'app.)
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
loadEnv({ path: path.join(repoRoot, ".env"), override: false });

const nextConfig: NextConfig = {
  transpilePackages: [
    "@coadvisor/ai",
    "@coadvisor/auth",
    "@coadvisor/core-platform",
    "@coadvisor/database",
    "@coadvisor/signdoc",
    "@coadvisor/types",
    "@coadvisor/ui",
    "pdfjs-dist",
  ],
  // Modules natifs / binaires : exclus du bundling serveur
  serverExternalPackages: ["@prisma/client", "argon2"],
};

export default nextConfig;
