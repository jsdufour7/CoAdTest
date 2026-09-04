import type { EmailMessage, EmailSender, EmailSendResult } from "../contract";

/** Capacité du tampon d'e-mails journalisés (ring buffer, dev/test). */
const OUTBOX_CAP = 50;

const outbox: (EmailMessage & { reference: string })[] = [];

/**
 * Provider « journal local » — défaut en développement : aucun e-mail
 * ne part, le message est conservé en mémoire (consultable par les
 * tests et le débogage) et tracé dans la console serveur.
 */
export class LogEmailProvider implements EmailSender {
  readonly name = "log";

  isConfigured(): boolean {
    return true;
  }

  send(message: EmailMessage): Promise<EmailSendResult> {
    const reference = `log-${outbox.length + 1}-${Date.now().toString(36)}`;
    outbox.push({ ...message, reference });
    if (outbox.length > OUTBOX_CAP) {
      outbox.shift();
    }
    console.info(
      `[notifications:log] → ${message.to} · « ${message.subject} » (${reference})`,
    );
    return Promise.resolve({ provider: this.name, reference });
  }
}

/** Lecture du tampon (tests unitaires / débogage local). */
export function getLoggedEmails(): readonly (EmailMessage & {
  reference: string;
})[] {
  return outbox;
}

/** Réinitialise le tampon (isolation des tests). */
export function clearLoggedEmails(): void {
  outbox.length = 0;
}
