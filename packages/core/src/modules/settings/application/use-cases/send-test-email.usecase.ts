import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";
import type { EmailSenderPort } from "../ports/email-sender.port";
import { renderTestEmail } from "../../infrastructure/email/email-templates";

export class SendTestEmailUseCase {
  constructor(
    private readonly settingsRepo: SettingsRepository,
    private readonly emailSender: EmailSenderPort,
  ) {}

  async execute(targetEmail: string): Promise<{ success: boolean; message: string }> {
    const emailSettings = await this.settingsRepo.getEmailSettings();
    if (!emailSettings.host || !emailSettings.user) {
      throw new Error("SMTP email configuration is incomplete. Host and user are required.");
    }

    const companySettings = await this.settingsRepo.getCompanySettings();
    const firmAddress = [
      companySettings.addressLine1,
      companySettings.city,
      companySettings.state,
      companySettings.postalCode,
      companySettings.country,
    ].filter(Boolean).join(", ");

    const template = renderTestEmail({
      host: emailSettings.host,
      port: emailSettings.port,
      firmName: companySettings.legalName || "RapidShift Labs Private Limited",
      firmAddress: firmAddress || "Bengaluru, Karnataka, India",
    });

    const res = await this.emailSender.send({
      to: targetEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return {
      success: res.accepted,
      message: res.accepted ? `Test email dispatched to ${targetEmail}` : "Failed to deliver email",
    };
  }
}
