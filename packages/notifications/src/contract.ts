import { DomainError } from "@coadvisor/types";

/** Version du contrat de notifications (traçabilité ADR-009). */
export const NOTIFICATIONS_VERSION = "notify-1.0";

/** Message e-mail transactionnel (pas de HTML pour l'instant — texte brut). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/** Résultat normalisé d'un envoi (référence provider, jamais le contenu). */
export interface EmailSendResult {
  provider: string;
  reference: string;
}

/**
 * Contrat commun des fournisseurs d'e-mails.
 * Même philosophie que le Copilot (ADR-008) : interface stable,
 * provider remplaçable sans toucher les modules consommateurs.
 */
export interface EmailSender {
  readonly name: string;
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export type NotificationErrorReason =
  | "not_configured"
  | "network"
  | "timeout"
  | "http"
  | "invalid_message"
  | "invalid_response";

/** Erreur de canal de notification — raison typée pour la télémétrie. */
export class NotificationError extends DomainError {
  readonly reason: NotificationErrorReason;

  constructor(message: string, reason: NotificationErrorReason) {
    super(message, `NOTIFICATION_${reason.toUpperCase()}`);
    this.name = "NotificationError";
    this.reason = reason;
  }
}
