import { NotificationError } from "../contract";
import type { EmailMessage, EmailSender, EmailSendResult } from "../contract";

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface ResendConfig {
  apiKey?: string;
  from?: string;
  endpoint?: string;
  timeoutMs?: number;
}

/**
 * Provider Resend (API REST, zéro SDK — fetch natif Node ≥ 20).
 * Activé par `EMAIL_PROVIDER=resend` (ou automatiquement si
 * `RESEND_API_KEY` est défini). Variables : RESEND_API_KEY,
 * EMAIL_FROM, EMAIL_RESEND_TIMEOUT_MS.
 */
export class ResendEmailProvider implements EmailSender {
  readonly name = "resend";

  private readonly apiKey?: string;
  private readonly from: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(overrides: ResendConfig = {}) {
    this.apiKey = overrides.apiKey ?? process.env.RESEND_API_KEY;
    this.from =
      overrides.from ??
      process.env.EMAIL_FROM ??
      "CoAdvisor <notifications@coadvisor.ca>";
    this.endpoint = overrides.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs =
      overrides.timeoutMs ??
      Number(process.env.EMAIL_RESEND_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  isConfigured(): boolean {
    return this.apiKey !== undefined && this.apiKey !== "";
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      throw new NotificationError(
        "RESEND_API_KEY absent — le provider Resend n'est pas configuré.",
        "not_configured",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new NotificationError(
          `Resend a répondu HTTP ${response.status}.`,
          "http",
        );
      }

      const payload = (await response.json()) as { id?: unknown };
      if (typeof payload.id !== "string" || payload.id === "") {
        throw new NotificationError(
          "Réponse Resend sans identifiant d'envoi.",
          "invalid_response",
        );
      }
      return { provider: this.name, reference: payload.id };
    } catch (error) {
      if (error instanceof NotificationError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new NotificationError(
          `Resend muet après ${this.timeoutMs} ms.`,
          "timeout",
        );
      }
      throw new NotificationError(
        "Le service Resend est injoignable.",
        "network",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
