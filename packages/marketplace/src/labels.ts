/**
 * Point d'entrée public « données pures » (@coadvisor/marketplace/labels) :
 * libellés et constantes partagés entre serveur ET composants client —
 * AUCUNE dépendance native (argon2, DB) ne doit transiter ici, sinon le
 * bundle navigateur échoue (frontière client/serveur, ADR-009).
 */
export {
  LANGUAGE_LABELS,
  MARKETPLACE_LANGUAGES,
  MARKETPLACE_SPECIALTIES,
  SPECIALTY_LABELS,
  dimensionToSpecialty,
} from "./match/specialties";
export type {
  MarketplaceLanguage,
  MarketplaceSpecialty,
} from "./match/specialties";
// Types uniquement — effacés à la compilation, jamais de code serveur.
export type { MyPublicProfile, PublicProfileCard } from "./profile/service";
