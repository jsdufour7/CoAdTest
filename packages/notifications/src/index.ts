export {
  NOTIFICATIONS_VERSION,
  NotificationError,
} from "./contract";
export type {
  EmailMessage,
  EmailSender,
  EmailSendResult,
  NotificationErrorReason,
} from "./contract";
export { LogEmailProvider } from "./providers/log-email.provider";
export {
  clearLoggedEmails,
  getLoggedEmails,
} from "./providers/log-email.provider";
export { ResendEmailProvider } from "./providers/resend-email.provider";
export {
  getEmailRoutingState,
  resolveEmailSender,
  sendEmail,
} from "./resolver";
export type { EmailProviderPreference } from "./resolver";
