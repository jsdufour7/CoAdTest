# ADR-015 — Continuité du coffre : réplication locale + objet S3-compatible région Canada (chiffré de bout en bout), manifeste SHA-256 relu à l'issue, gâchette opérateur bornée, registre append-only des exécutions

- **Statut :** Accepté — Sprint 8 (v0.11.0)
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le coffre documentaire (ADR-010) chiffre chaque blob AES-256-GCM et le
pose sur disque local (`var/documents`) — responsabilité maximale,
sécurité maximale, mais **sinistre = perte sèche**. Le choix fondateur
(2026-08-02) : sauvegarde vers un **objet S3-compatible région Canada**
(AWS `ca-central-1`, OVH BHS ou MinIO auto-hébergé) **+ réplication
locale systématique**, sans jamais faire transiter de clair.

Points de non-négociation hérités : la clé maîtresse ne quitte jamais le
serveur ; le stockage objet ne voit QUE du chiffré ; l'audit reste
transactionnel ; `ObjectStorage` (contrat ADR-010) reste l'interface.

## Décision 1 — Client S3 maison, SigV4 pur, zéro SDK

`packages/documents/src/storage/sigv4.ts` — signeur **AWS Signature
Version 4** pur (HMAC chaînée `AWS4-<secret>` région/service, horodatage
injectable pour les vecteurs de test officiels AWS) ; `s3-client.ts` —
`S3CompatibleObjectStore` implémentant `PutObject/HeadObject/ListObjectsV2`
(décodage XML par regex bornées — charge utile REST étroite et relue),
styles **virtual-hosted ET path** (AWS vs MinIO/OVH), région
`ca-central-1` par défaut, `fromEnvironment()` retournant `null` tant
que `S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` ne sont pas
renseignés (l'UI affiche alors la carte « Prêt à câbler » au lieu de
casser). `Uint8Array.from(Buffer)` pour la compat TS DOM/node.

Pourquoi pas le SDK AWS : 3 opérations, une seule classe d'erreurs, et
surtout **la souveraineté du code** qui touche aux blobs (audit humain
complet possible en 20 minutes).

## Décision 2 — Cycle de sauvegarde vérifiable, copie atomique, manifeste relu

`backup/backup.service.ts` — `executeBackupCycle` :

1. **Inventaire** : `listBlobEntries` récursif TRIÉ (déterminisme de
   rejeu) du coffre source ;
2. **Réplica locale** (`DOCUMENTS_REPLICA_DIR`) : `copyIfChanged`
   (taille + mtime → sinon saut), écriture **atomique `.part` + rename**
   — une coupure en vol ne laisse jamais un blob tronqué ;
3. **S3** : `PutObject` des blobs manquants/différents — ciphertext
   tel quel, aucune re-clé, la photo marketplace (désormais dans le
   coffre, § ADR-013 usage coffre) voyage pareil ;
4. **Manifeste JSON** (`BACKUP_MANIFESTS_DIR/manifest-<iso>.json`) :
   inventaire + sha256 par blob + totaux ;
5. **Vérification** : relecture du réplica et **re-hash SHA-256**
   comparé au manifeste → statut `VERIFIED` | `FAILED` seulement À
   L'ISSUE (une ligne `backup_runs` n'existe que terminée — jamais de
   « running » zombie ; nota : l'`ETag` S3 n'est PAS comparable hors
   uploads mono-partie MD5, d'où le re-hash local, borné aux objets ≤
   seuil mono-partie) ;
6. Consignation : `recordRun` → ligne `backup_runs` (append-only,
   `REVOKE UPDATE/DELETE`) + audit `documents.backup.completed` +
   événement `backup.completed`.

`report` jsonb garde compteurs (blobs/copiés/octets/durée) et erreur ;
`engine_version backup-1.0`.

## Décision 3 — Deux gâchettes, une seule autorité

- **Manuelle** : `runBackupNow` — `assertBackupAuthorized` exige rôle
  **ADMIN + tenant = `PLATFORM_TENANT_SLUG`** (l'opérateur sauvegarde le
  coffre PLATEFORME — les blobs sont multi-tenants par conception, une
  sauvegarde par cabinet n'aurait pas de sens) ; bouton
  « Lancer une sauvegarde maintenant » sur `/parametres/sauvegardes`
  (routage source/réplica/S3 affiché, registre des exécutions).
- **Planifiée** : `runScheduledBackup` en **contexte système** via CLI
  `pnpm --filter @coadvisor/documents backup:run` (cron/systemd au choix
  de l'Ops) — validée au bac à sable : 170 blobs, 170 copiés,
  802 360 octets en 201 ms, manifeste relu.

## Conséquences

- RPO/RTO honnêtes pour le discours commercial : réplica locale
  (restauration immédiate) + objet Canada (sinistre site) ; la
  restauration est l'inverse du chiffrement — documentée au README.
- Loi 25 / souveraineté : les objets quittent la machine CHIFFRÉS avec
  clés de chiffrement de données enveloppées par la clé maîtresse
  locale ; un état tiers ne peut exiger de clair à l'hébergeur objet.
- Coût : agent de cron + un bucket ; aucun service managé de backup.
- Limites assumées (v1) : pas de rétention/rotation automatique des
  manifestes (compression simple recommandée au README), pas de test de
  RESTAURATION automatisé en e2e (la vérification sha256 couvre
  l'intégrité de la copie, pas le déchiffrement de bout en bout — la
  route photo du marketplace l'exerce en réel à chaque page vue).
