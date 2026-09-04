# ─────────────────────────────────────────────────────────────
# CoAdvisor — Mise à jour + relance complète (PowerShell 5.1+)
# Lancé par maj-coadvisor.cmd (double-clic) ou à la main.
# ─────────────────────────────────────────────────────────────

Set-Location $PSScriptRoot   # la racine du projet, où qu'on clique

function Step($num, $titre) {
  Write-Host ""
  Write-Host "== $num. $titre ==" -ForegroundColor Cyan
}

function Check() {
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Échec à l'étape précédente (code $LASTEXITCODE)." -ForegroundColor Red
    Write-Host "Si la base refuse de démarrer : Docker Desktop doit être lancé." -ForegroundColor Yellow
    pause
    exit 1
  }
}

Step 1 "Base de données PostgreSQL (docker — déjà démarrée ? on s'assure)"
pnpm db:up
Check

Step 2 "Dépendances (pnpm install — aligne sur le lockfile)"
pnpm install
Check

Step 3 "Migrations SQL (idempotent — inoffensif si rien de nouveau)"
pnpm db:migrate
Check

# Décommenter les lignes suivantes pour re-semer la démo :
# pnpm db:seed
# pnpm db:seed:demo

Step 4 "Lancement des 3 apps — :3000 conseiller · :3001 portail · :3002 annuaire"
Write-Host "Ctrl+C ici pour tout arrêter. Fermer la fenêtre revient au même." -ForegroundColor DarkGray
pnpm dev
