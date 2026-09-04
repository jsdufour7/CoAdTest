import { NotificationError } from "./contract";
import type { EmailMessage, EmailSender, EmailSendResult } from "./contract";
import { LogEmailProvider } from "./providers/log-email.provider";
import { ResendEmailProvider } from "./providers/resend-email.provider";

export type EmailProviderPreference = "auto" | "log" | "resend";

function preference(): EmailProviderPreference {
  const raw = (process.env.EMAIL_PROVIDER ?? "auto").trim();
  return raw === "log" || raw === "resend" ? raw : "auto";
}

/**
 * Résout le provider d'e-mails actif.
 * - `auto` (défaut) : Resend si RESEND_API_KEY défini, sinon log local ;
 * - `log` / `resend` : forçage explicite (diagnostic).
 */
export function resolveEmailSender(): EmailSender {
  const pref = preference();
  const resend = new ResendEmailProvider();
  if (pref === "resend") {
    return resend;
  }
  if (pref === "log") {
    return new LogEmailProvider();
  }
  return resend.isConfigured() ? resend : new LogEmailProvider();
}

/** État du routage (indicateur UI/diagnostic, sans secret). */
export function getEmailRoutingState(): {
  preference: EmailProviderPreference;
  active: string;
  resendConfigured: boolean;
} {
  const sender = resolveEmailSender();
  return {
    preference: preference(),
    active: sender.name,
    resendConfigured: new ResendEmailProvider().isConfigured(),
  };
}

/** Envoi normalisé + validation minimale du message. */
export async function sendEmail(
  message: EmailMessage,
): Promise<EmailSendResult> {
  if (
    message.to.trim() === "" ||
    message.subject.trim() === "" ||
    message.text.trim() === ""
  ) {
    throw new NotificationError(
      "Message e-mail incomplet (destinataire, sujet et texte requis).",
      "invalid_message",
    );
  }
  return resolveEmailSender().send(message);
}
