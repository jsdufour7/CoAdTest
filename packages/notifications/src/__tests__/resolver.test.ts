import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationError } from "../contract";
import {
  clearLoggedEmails,
  getLoggedEmails,
} from "../providers/log-email.provider";
import {
  getEmailRoutingState,
  resolveEmailSender,
  sendEmail,
} from "../resolver";

describe("notifications — résolution et envoi (notify-1.0)", () => {
  beforeEach(() => {
    clearLoggedEmails();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("provider par défaut : journal local (aucune clé requise)", () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const sender = resolveEmailSender();
    expect(sender.name).toBe("log");
    expect(getEmailRoutingState()).toEqual({
      preference: "auto",
      active: "log",
      resendConfigured: false,
    });
  });

  it("le journal local capture le message (consultable en test)", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "log");
    const result = await sendEmail({
      to: "conseiller@cabinet.ca",
      subject: "Nouvelle demande de contact",
      text: "Bonjour, vous avez reçu une demande via l'annuaire.",
    });
    expect(result.provider).toBe("log");
    expect(result.reference).toContain("log-");
    const logged = getLoggedEmails();
    expect(logged).toHaveLength(1);
    expect(logged[0]?.to).toBe("conseiller@cabinet.ca");
    expect(logged[0]?.subject).toContain("demande");
  });

  it("message incomplet rejeté avant tout appel provider", async () => {
    await expect(
      sendEmail({ to: "", subject: "Sujet", text: "Corps" }),
    ).rejects.toThrowError(NotificationError);
    await expect(
      sendEmail({ to: "", subject: "Sujet", text: "Corps" }),
    ).rejects.toMatchObject({ reason: "invalid_message" });
  });

  it("auto avec RESEND_API_KEY → provider resend", () => {
    vi.stubEnv("EMAIL_PROVIDER", "auto");
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    expect(resolveEmailSender().name).toBe("resend");
    expect(getEmailRoutingState().resendConfigured).toBe(true);
  });

  it("resend forcé SANS clé → erreur not_configured explicite", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(
      sendEmail({ to: "a@b.ca", subject: "S", text: "T" }),
    ).rejects.toMatchObject({ reason: "not_configured" });
  });

  it("log forcé ignore RESEND_API_KEY", () => {
    vi.stubEnv("EMAIL_PROVIDER", "log");
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    expect(resolveEmailSender().name).toBe("log");
  });
});
