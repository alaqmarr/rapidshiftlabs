import nodemailer from "nodemailer";
import type {
  BillingEmailServicePort,
  SendInvoiceEmailParams,
  SendDunningEmailParams,
  SendPaymentReceiptEmailParams,
} from "../../application/ports/billing-email.port";
import { getSettingsModule } from "../../../settings";
import {
  renderInvoiceIssuedEmail,
  renderDunningEmail,
  renderPaymentReceiptEmail,
} from "../../../settings";

export class NodemailerBillingEmailService implements BillingEmailServicePort {
  private async getTransporter() {
    const settingsModule = getSettingsModule();
    const config = await settingsModule.repo.getEmailSettings();

    if (!config.host || !config.user) {
      return null;
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

    const fromAddress = config.fromName
      ? `"${config.fromName}" <${config.fromEmail || config.user}>`
      : (config.fromEmail || config.user);

    return { transporter, fromAddress };
  }

  async sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void> {
    const settingsModule = getSettingsModule();
    const companySettings = await settingsModule.repo.getCompanySettings();

    const firmAddress = [
      companySettings.addressLine1,
      companySettings.city,
      companySettings.state,
      companySettings.postalCode,
      companySettings.country,
    ]
      .filter(Boolean)
      .join(", ");

    const rendered = renderInvoiceIssuedEmail({
      invoiceNumber: params.invoiceNumber,
      totalFormatted: params.totalFormatted,
      dueDateFormatted: params.dueDateFormatted,
      clientName: params.to.split("@")[0] || "Client",
      paymentUrl: `/portal/billing`,
      firmName: companySettings.legalName || "RapidShift Labs Private Limited",
      firmAddress: firmAddress || "Bengaluru, Karnataka, India",
      firmGstin: companySettings.gstin,
      firmPan: companySettings.pan,
    });

    const smtp = await this.getTransporter();
    if (!smtp) {
      console.warn(
        `[NodemailerBilling] SMTP not configured. Simulating invoice email for ${params.invoiceNumber} to ${params.to}`,
      );
      return;
    }

    const attachments = params.pdfBuffer
      ? [
          {
            filename: `${params.invoiceNumber.replace(/[\/\\]/g, "-")}.pdf`,
            content: params.pdfBuffer,
            contentType: "application/pdf",
          },
        ]
      : [];

    await smtp.transporter.sendMail({
      from: smtp.fromAddress,
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments,
    });
  }

  async sendDunningEmail(params: SendDunningEmailParams): Promise<void> {
    const settingsModule = getSettingsModule();
    const companySettings = await settingsModule.repo.getCompanySettings();

    const rendered = renderDunningEmail({
      invoiceNumber: params.invoiceNumber,
      balanceFormatted: params.balanceFormatted,
      dueDateFormatted: params.dueDateFormatted,
      daysOffset: params.daysOffset,
      paymentUrl: `/portal/billing`,
      firmName: companySettings.legalName || "RapidShift Labs Private Limited",
    });

    const smtp = await this.getTransporter();
    if (!smtp) {
      console.warn(
        `[NodemailerBilling] SMTP not configured. Simulating dunning reminder for ${params.invoiceNumber} (offset: ${params.daysOffset}d) to ${params.to}`,
      );
      return;
    }

    await smtp.transporter.sendMail({
      from: smtp.fromAddress,
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  async sendPaymentReceiptEmail(params: SendPaymentReceiptEmailParams): Promise<void> {
    const settingsModule = getSettingsModule();
    const companySettings = await settingsModule.repo.getCompanySettings();

    const rendered = renderPaymentReceiptEmail({
      receiptNumber: params.receiptNumber,
      invoiceNumber: params.invoiceNumber,
      amountFormatted: params.amountFormatted,
      clientName: params.clientName,
      paymentMethod: params.paymentMethod,
      firmName: companySettings.legalName || "RapidShift Labs Private Limited",
    });

    const smtp = await this.getTransporter();
    if (!smtp) {
      console.warn(
        `[NodemailerBilling] SMTP not configured. Simulating payment receipt for ${params.receiptNumber} to ${params.to}`,
      );
      return;
    }

    await smtp.transporter.sendMail({
      from: smtp.fromAddress,
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }
}
