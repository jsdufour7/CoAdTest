import {
  LocalEncryptedObjectStore,
  LOCAL_STORE_VERSION,
  resolveStorageDir,
} from "./local-encrypted.store";
import type { ObjectStorage } from "./contract";

/**
 * Résolveur du provider de stockage (pattern ADR-008) : un seul
 * provider pour l'instant — le futur provider S3 région Canada se
 * branchera ici sans toucher au vault.
 */
let singleton: LocalEncryptedObjectStore | undefined;

export function getObjectStorage(): ObjectStorage {
  singleton ??= LocalEncryptedObjectStore.fromEnvironment();
  return singleton;
}

/** État de routage pour diagnostics UI (page Coffre). */
export function getStorageRoutingState(): {
  provider: "local-encrypted";
  version: string;
  storageDir: string;
  masterKeyConfigured: boolean;
} {
  return {
    provider: "local-encrypted",
    version: LOCAL_STORE_VERSION,
    storageDir: resolveStorageDir(process.env.DOCUMENTS_STORAGE_DIR),
    masterKeyConfigured: Boolean(process.env.DOCUMENTS_MASTER_KEY?.trim()),
  };
}
