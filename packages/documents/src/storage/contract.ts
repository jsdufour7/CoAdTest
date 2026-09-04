import type { Readable } from "node:stream";

import { DomainError } from "@coadvisor/types";

/** Résultat d'un dépôt : preuves de contenu persistées côté BDD. */
export interface StoredObject {
  /** Clé relative au répertoire de stockage (jamais absolue). */
  storageKey: string;
  /** Taille du contenu EN CLAIR (octets). */
  sizeBytes: number;
  /** SHA-256 hex du contenu EN CLAIR (preuve d'intégrité signable). */
  sha256: string;
  /** Tag d'authentification AEAD (base64) — requis au déchiffrement. */
  contentTag: string;
}

/**
 * Contrat du stockage objet du coffre (pattern ADR-008 — un provider
 * derrière une interface ; la variante S3 région Canada se branchera
 * ici sans toucher au vault).
 */
export interface ObjectStorage {
  /** Identifiant court du provider (ex. "local-encrypted"). */
  readonly name: string;
  /**
   * Écrit `stream` chiffré dans un nouvel objet. Écriture atomique
   * (fichier temporaire puis renommage) : un crash ne laisse jamais
   * un objet à moitié écrit adressable.
   */
  put(stream: Readable, storageKey: string): Promise<StoredObject>;
  /**
   * Flux DECHIFFRÉ d'un objet. `contentTag` doit correspondre au tag
   * enregistré au dépôt — sinon `StorageError("integrity")`.
   */
  openRead(storageKey: string, contentTag: string): Promise<Readable>;
  /** Lecture complète en mémoire (usage interne : rapports, signature). */
  readAll(storageKey: string, contentTag: string): Promise<Buffer>;
  /** Suppression physique (purge RGPD après soft-delete logique). */
  remove(storageKey: string): Promise<void>;
  /** Présence d'un objet (diagnostic). */
  exists(storageKey: string): Promise<boolean>;
}

export type StorageErrorReason =
  | "not_configured"
  | "io"
  | "integrity"
  | "invalid_key";

export class StorageError extends DomainError {
  readonly reason: StorageErrorReason;

  constructor(reason: StorageErrorReason, message: string) {
    super(message, `STORAGE_${reason.toUpperCase()}`);
    this.name = "StorageError";
    this.reason = reason;
  }
}
