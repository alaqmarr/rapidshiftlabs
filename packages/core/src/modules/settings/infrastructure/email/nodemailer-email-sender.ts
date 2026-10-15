import nodemailer from "nodemailer";
import type {
  EmailSenderPort,
  SendEmailParams,
} from "../../application/ports/email-sender.port";
import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";

export class NodemailerEmailSender implements EmailSenderPort {
  constructor(private readonly settingsRepo: SettingsRepository) {}

  async send(params: SendEmailParams): Promise<{ messageId?: string; accepted: boolean }> {
    const config = await this.settingsRepo.getEmailSettings();

    // If host is not configured or in test mode without live credentials, handle gracefully
    if (!config.host || !config.user) {
      console.warn("[NodemailerEmailSender] SMTP not configured. Simulating email send:", params.to, params.subject);
      return { messageId: `mock-${Date.now()}`, accepted: true };
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const fromAddress = config.fromName ? `"${config.fromName}" <${config.fromEmail || config.user}>` : (config.fromEmail || config.user);

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      console.log(
        `[NodemailerEmailSender] Successfully dispatched "${params.subject}" to ${params.to} (ID: ${info.messageId})`,
      );

      return {
        messageId: info.messageId,
        accepted: Array.isArray(info.accepted) && info.accepted.length > 0,
      };
    } catch (err) {
      console.error(
        `[NodemailerEmailSender] SMTP delivery error for "${params.subject}" to ${params.to}:`,
        err,
      );
      throw err;
    }
  }
}
