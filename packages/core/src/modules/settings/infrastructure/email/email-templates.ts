/**
 * RapidShift Branded Email Template Engine
 * Generates beautiful, responsive, bulletproof HTML emails for transactional,
 * billing, support, and infrastructure alerts.
 */

export interface EmailLayoutOptions {
  preheader?: string;
  firmName?: string;
  firmAddress?: string;
  firmGstin?: string;
  firmPan?: string;
  firmEmail?: string;
  childrenHtml: string;
}

export function wrapInBrandedEmailLayout(options: EmailLayoutOptions): string {
  const firmName = options.firmName || "RapidShift Labs Private Limited";
  const firmAddress = options.firmAddress || "Bengaluru, Karnataka, India";
  const firmEmail = options.firmEmail || "support@rapidshiftlabs.com";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RapidShift Labs</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  ${
    options.preheader
      ? `<span style="display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">${options.preheader}</span>`
      : ""
  }
  
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          
          <!-- Top Accent Bar -->
          <tr>
            <td height="4" style="background-color: #2563eb; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle" width="36">
                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #2563eb, #1d4ed8); border-radius: 8px; text-align: center; line-height: 32px; color: #ffffff; font-weight: bold; font-size: 17px;">
                      R
                    </div>
                  </td>
                  <td valign="middle" style="padding-left: 12px;">
                    <div style="font-size: 16px; font-weight: 700; color: #0f172a; letter-spacing: -0.2px;">RapidShift Labs</div>
                    <div style="font-size: 11px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Cloud &amp; Platform Control Plane</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px; line-height: 1.6; font-size: 14px; color: #334155;">
              ${options.childrenHtml}
            </td>
          </tr>

          <!-- Legal & Compliance Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">${firmName}</p>
              <p style="margin: 0 0 8px 0;">${firmAddress}</p>
              ${
                options.firmGstin || options.firmPan
                  ? `<p style="margin: 0 0 8px 0; font-family: monospace;">${[
                      options.firmGstin ? `GSTIN: ${options.firmGstin}` : "",
                      options.firmPan ? `PAN: ${options.firmPan}` : "",
                    ]
                      .filter(Boolean)
                      .join("  |  ")}</p>`
                  : ""
              }
              <p style="margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8;">
                This is a secure system notification dispatched by RapidShift Labs. For questions, contact <a href="mailto:${firmEmail}" style="color: #2563eb; text-decoration: none;">${firmEmail}</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Invoice Issued Email Template
 */
export function renderInvoiceIssuedEmail(params: {
  invoiceNumber: string;
  totalFormatted: string;
  dueDateFormatted: string;
  clientName: string;
  paymentUrl?: string;
  firmName?: string;
  firmAddress?: string;
  firmGstin?: string;
  firmPan?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Invoice ${params.invoiceNumber} from RapidShift Labs - ${params.totalFormatted}`;
  const childrenHtml = `
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
      Tax Invoice Ready for Payment
    </h1>
    <p style="margin: 0 0 16px 0;">
      Hello <strong>${params.clientName}</strong>,
    </p>
    <p style="margin: 0 0 24px 0;">
      Your tax invoice <strong>${params.invoiceNumber}</strong> has been generated and is attached to this email as a verified PDF.
    </p>

    <!-- Highlight Invoice Details Box -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; padding: 18px 20px;">
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Invoice Reference:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${params.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Total Amount Due:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 16px; font-weight: 700; color: #2563eb;">${params.totalFormatted}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">Due Date:</td>
        <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.dueDateFormatted}</td>
      </tr>
    </table>

    ${
      params.paymentUrl
        ? `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${params.paymentUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
        View &amp; Pay Invoice Online &rarr;
      </a>
    </div>
    `
        : ""
    }

    <p style="margin: 0; font-size: 12px; color: #64748b;">
      Bank transfer and UPI details are available on the attached PDF invoice. Thank you for partnering with RapidShift Labs.
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: `Invoice ${params.invoiceNumber} for ${params.totalFormatted} is ready.`,
    firmName: params.firmName,
    firmAddress: params.firmAddress,
    firmGstin: params.firmGstin,
    firmPan: params.firmPan,
    childrenHtml,
  });

  const text = `Invoice ${params.invoiceNumber} from RapidShift Labs\nTotal: ${params.totalFormatted}\nDue: ${params.dueDateFormatted}\nClient: ${params.clientName}\nPlease find your invoice PDF attached.`;

  return { subject, html, text };
}

/**
 * Payment Receipt Email Template
 */
export function renderPaymentReceiptEmail(params: {
  receiptNumber: string;
  invoiceNumber: string;
  amountFormatted: string;
  clientName: string;
  paymentMethod: string;
  firmName?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Payment Received: ${params.receiptNumber} (${params.amountFormatted})`;
  const childrenHtml = `
    <div style="width: 40px; height: 40px; background-color: #dcfce7; border-radius: 50%; text-align: center; line-height: 40px; color: #16a34a; font-size: 20px; margin-bottom: 16px;">
      &#10003;
    </div>
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
      Payment Received — Thank You!
    </h1>
    <p style="margin: 0 0 16px 0;">
      Hello <strong>${params.clientName}</strong>,
    </p>
    <p style="margin: 0 0 24px 0;">
      We have successfully recorded your payment of <strong>${params.amountFormatted}</strong> for invoice <strong>${params.invoiceNumber}</strong>.
    </p>

    <!-- Receipt Details Box -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; padding: 18px 20px;">
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Receipt Number:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${params.receiptNumber}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Invoice Reference:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 600; color: #0f172a;">${params.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Amount Paid:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 16px; font-weight: 700; color: #16a34a;">${params.amountFormatted}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">Payment Method:</td>
        <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.paymentMethod.toUpperCase()}</td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 12px; color: #64748b;">
      Your updated account ledger and access entitlement status are updated immediately across all connected applications.
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: `Payment of ${params.amountFormatted} received for ${params.invoiceNumber}.`,
    firmName: params.firmName,
    childrenHtml,
  });

  const text = `Payment of ${params.amountFormatted} recorded for invoice ${params.invoiceNumber}. Receipt: ${params.receiptNumber}. Thank you for your payment.`;

  return { subject, html, text };
}

/**
 * Dunning / Payment Reminder Email Template
 */
export function renderDunningEmail(params: {
  invoiceNumber: string;
  balanceFormatted: string;
  dueDateFormatted: string;
  daysOffset: number;
  paymentUrl?: string;
  firmName?: string;
}): { subject: string; html: string; text: string } {
  const isOverdue = params.daysOffset > 0;
  const isDueToday = params.daysOffset === 0;

  const title = isOverdue
    ? `URGENT: Invoice ${params.invoiceNumber} is ${params.daysOffset} Days Overdue`
    : isDueToday
      ? `Payment Due Today: Invoice ${params.invoiceNumber}`
      : `Upcoming Payment Reminder: Invoice ${params.invoiceNumber}`;

  const accentColor = isOverdue ? "#dc2626" : isDueToday ? "#ea580c" : "#2563eb";

  const childrenHtml = `
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: ${accentColor}; letter-spacing: -0.3px;">
      ${title}
    </h1>
    <p style="margin: 0 0 16px 0;">
      ${
        isOverdue
          ? `Invoice <strong>${params.invoiceNumber}</strong> was due on <strong>${params.dueDateFormatted}</strong> and is currently unpaid. Continued failure to settle outstanding balances may trigger automated service access gating.`
          : isDueToday
            ? `Your invoice <strong>${params.invoiceNumber}</strong> is due today, <strong>${params.dueDateFormatted}</strong>.`
            : `This is a courtesy reminder that invoice <strong>${params.invoiceNumber}</strong> is scheduled for payment on <strong>${params.dueDateFormatted}</strong>.`
      }
    </p>

    <!-- Summary Box -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${isOverdue ? "#fef2f2" : "#f8fafc"}; border: 1px solid ${isOverdue ? "#fecaca" : "#e2e8f0"}; border-radius: 8px; margin-bottom: 24px; padding: 18px 20px;">
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Invoice Number:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${params.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Outstanding Dues:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 16px; font-weight: 700; color: ${accentColor};">${params.balanceFormatted}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">Due Date:</td>
        <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.dueDateFormatted}</td>
      </tr>
    </table>

    ${
      params.paymentUrl
        ? `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${params.paymentUrl}" style="background-color: ${accentColor}; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">
        Pay Outstanding Balance &rarr;
      </a>
    </div>
    `
        : ""
    }

    <p style="margin: 0; font-size: 12px; color: #64748b;">
      If you have already remitted this payment, please disregard this automated notification or submit your transaction reference via the client portal.
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: title,
    firmName: params.firmName,
    childrenHtml,
  });

  const text = `${title}\nInvoice: ${params.invoiceNumber}\nOutstanding: ${params.balanceFormatted}\nDue: ${params.dueDateFormatted}`;

  return { subject: title, html, text };
}

/**
 * SMTP System Verification Test Email Template
 */
export function renderTestEmail(params: {
  host: string;
  port: number;
  firmName?: string;
  firmAddress?: string;
}): { subject: string; html: string; text: string } {
  const subject = `RapidShift Labs - SMTP Verification Test`;
  const childrenHtml = `
    <div style="width: 40px; height: 40px; background-color: #eff6ff; border-radius: 50%; text-align: center; line-height: 40px; color: #2563eb; font-size: 20px; margin-bottom: 16px;">
      &#9881;
    </div>
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
      SMTP Delivery Verification Successful
    </h1>
    <p style="margin: 0 0 20px 0;">
      This email confirms that your outgoing mail server configuration in RapidShift Labs Control Plane is working properly.
    </p>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; padding: 16px 18px;">
      <tr>
        <td style="padding-bottom: 6px; font-size: 12px; color: #64748b;">SMTP Host:</td>
        <td align="right" style="padding-bottom: 6px; font-size: 12px; font-weight: 600; color: #0f172a; font-family: monospace;">${params.host}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">SMTP Port:</td>
        <td align="right" style="font-size: 12px; font-weight: 600; color: #0f172a; font-family: monospace;">${params.port}</td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 12px; color: #64748b;">
      All client invitations, automated invoice deliveries, and monitoring incident dispatches will use these verified credentials.
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: "SMTP email transport connection verified successfully.",
    firmName: params.firmName,
    firmAddress: params.firmAddress,
    childrenHtml,
  });

  const text = `RapidShift Labs SMTP Verification Test.\nHost: ${params.host}:${params.port}\nYour SMTP settings are configured and operational.`;

  return { subject, html, text };
}

/**
 * Contract Agreement Issued / Activated Email Template
 */
export function renderContractAgreementEmail(params: {
  contractCode: string;
  contractTitle: string;
  clientName: string;
  retainerFormatted: string;
  billingCycle: string;
  validFromFormatted: string;
  validToFormatted: string;
  portalUrl?: string;
  firmName?: string;
  firmAddress?: string;
  firmGstin?: string;
  firmPan?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Master Services Agreement: ${params.contractCode} (${params.contractTitle})`;
  const childrenHtml = `
    <div style="width: 40px; height: 40px; background-color: #eff6ff; border-radius: 50%; text-align: center; line-height: 40px; color: #2563eb; font-size: 20px; margin-bottom: 16px;">
      &#128220;
    </div>
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
      Master Services Agreement Activated
    </h1>
    <p style="margin: 0 0 16px 0;">
      Hello <strong>${params.clientName}</strong>,
    </p>
    <p style="margin: 0 0 24px 0;">
      Your Master Services Agreement (MSA) reference <strong>${params.contractCode}</strong> for <strong>${params.contractTitle}</strong> has been issued and is attached as a legally binding, digitally verified PDF.
    </p>

    <!-- Contract Highlight Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; padding: 18px 20px;">
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Contract Reference:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${params.contractCode}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Agreed Retainer:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 15px; font-weight: 700; color: #2563eb;">${params.retainerFormatted}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Billing Cycle:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 600; color: #0f172a; text-transform: capitalize;">${params.billingCycle.replace(/_/g, " ")}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">Effective Tenure:</td>
        <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.validFromFormatted} to ${params.validToFormatted}</td>
      </tr>
    </table>

    ${
      params.portalUrl
        ? `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${params.portalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
        View Contract in Client Portal &rarr;
      </a>
    </div>
    `
        : ""
    }

    <p style="margin: 0; font-size: 12px; color: #64748b;">
      The attached PDF includes your full Service Level Agreement (SLA), downtime escalation protocols, access gating rules, and remittance banking instructions.
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: `Agreement ${params.contractCode} (${params.contractTitle}) has been activated.`,
    firmName: params.firmName,
    firmAddress: params.firmAddress,
    firmGstin: params.firmGstin,
    firmPan: params.firmPan,
    childrenHtml,
  });

  const text = `Master Services Agreement Activated: ${params.contractCode} (${params.contractTitle})\nClient: ${params.clientName}\nRetainer: ${params.retainerFormatted}\nTenure: ${params.validFromFormatted} to ${params.validToFormatted}\nPlease find the agreement PDF attached.`;

  return { subject, html, text };
}

/**
 * Client User Invitation Email Template
 */
export function renderClientInvitationEmail(params: {
  clientName: string;
  userName: string;
  userEmail: string;
  tempPassword: string;
  role: string;
  portalUrl?: string;
  firmName?: string;
  firmAddress?: string;
  firmEmail?: string;
}): { subject: string; html: string; text: string } {
  const portalUrl = params.portalUrl || "http://localhost:3000/login";
  const roleLabel =
    params.role === "client_admin" ? "Organization Administrator" : "Technical Team Member";
  const subject = `Invitation: Access RapidShift Labs Client Portal for ${params.clientName}`;

  const childrenHtml = `
    <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #eff6ff, #dbeafe); border-radius: 12px; text-align: center; line-height: 44px; color: #2563eb; font-size: 22px; margin-bottom: 20px; border: 1px solid #bfdbfe;">
      &#128273;
    </div>
    <h1 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px;">
      Welcome to RapidShift Labs
    </h1>
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #334155; line-height: 1.6;">
      Hello <strong>${params.userName}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #334155; line-height: 1.6;">
      You have been invited to access the RapidShift Labs Client Portal for <strong>${params.clientName}</strong> as a <strong>${roleLabel}</strong>.
      From the portal, you can monitor server fleet performance, manage domain health, review billing &amp; contracts, and engage 24&times;7 operations engineering.
    </p>

    <!-- Credential Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 24px; padding: 20px;">
      <tr>
        <td style="padding-bottom: 10px; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Your Portal Sign-in Credentials</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size: 13px; color: #64748b; width: 130px;">Email / Username:</td>
              <td style="font-size: 13px; font-weight: 600; color: #0f172a; font-family: monospace;">${params.userEmail}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 12px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size: 13px; color: #64748b; width: 130px;">Temporary Password:</td>
              <td>
                <span style="display: inline-block; background-color: #ffffff; border: 1px dashed #cbd5e1; padding: 6px 12px; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 700; color: #2563eb; letter-spacing: 0.5px;">
                  ${params.tempPassword}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size: 13px; color: #64748b; width: 130px;">Assigned Role:</td>
              <td style="font-size: 12px; font-weight: 600; color: #047857;">
                <span style="background-color: #d1fae5; color: #065f46; padding: 3px 8px; border-radius: 4px;">${roleLabel}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Action Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 34px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.25);">
        Sign In to RapidShift Portal &rarr;
      </a>
    </div>

    <!-- Security Advisory -->
    <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
      <div style="font-size: 12px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">Security Notice</div>
      <div style="font-size: 12px; color: #1e3a8a; line-height: 1.5;">
        Please change your temporary password immediately upon your first sign in via the Account Settings panel. Never share your credentials or multi-tenant API tokens.
      </div>
    </div>

    <p style="margin: 0; font-size: 12px; color: #64748b;">
      Direct Portal URL: <a href="${portalUrl}" style="color: #2563eb; text-decoration: none;">${portalUrl}</a>
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: `You have been invited to access the RapidShift Labs Client Portal for ${params.clientName}.`,
    firmName: params.firmName,
    firmAddress: params.firmAddress,
    firmEmail: params.firmEmail,
    childrenHtml,
  });

  const text = `Welcome to RapidShift Labs!\n\nHello ${params.userName},\n\nYou have been invited to join the RapidShift Labs Client Portal for ${params.clientName} as a ${roleLabel}.\n\nSign in at: ${portalUrl}\nEmail: ${params.userEmail}\nTemporary Password: ${params.tempPassword}\n\nPlease change your password upon first login.\n\nRapidShift Labs Team`;

  return { subject, html, text };
}

/**
 * Support Ticket Created Notification Template
 */
export function renderTicketCreatedEmail(params: {
  ticketNumber: string;
  ticketSubject: string;
  clientName: string;
  priority: string;
  category: string;
  initialMessage: string;
  isStaffNotification?: boolean;
  portalUrl?: string;
  firmName?: string;
}): { subject: string; html: string; text: string } {
  const isStaff = Boolean(params.isStaffNotification);
  const portalUrl = params.portalUrl || "http://localhost:3000/portal/support";

  const subject = isStaff
    ? `[TICKET ALERT] New ${params.priority} Ticket: ${params.ticketNumber} (${params.clientName})`
    : `Support Ticket Received: ${params.ticketNumber} - ${params.ticketSubject}`;

  const priorityColor =
    params.priority === "P1" ? "#dc2626" : params.priority === "P2" ? "#ea580c" : "#2563eb";

  const childrenHtml = `
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
      ${isStaff ? "New Support Ticket Logged" : "Ticket Logged with Systems Engineering"}
    </h1>
    <p style="margin: 0 0 16px 0;">
      ${
        isStaff
          ? `Client <strong>${params.clientName}</strong> has submitted a new support ticket.`
          : `Hello <strong>${params.clientName}</strong>, we have received your support request. Our 24&times;7 operations team has prioritized it.`
      }
    </p>

    <!-- Ticket Summary Box -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; padding: 18px 20px;">
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Ticket Reference:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${params.ticketNumber}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Priority Level:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: ${priorityColor};">${params.priority}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Category:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 600; color: #0f172a; text-transform: capitalize;">${params.category}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">Subject:</td>
        <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.ticketSubject}</td>
      </tr>
    </table>

    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">Issue Description</div>
      <div style="font-size: 13px; color: #1e293b; line-height: 1.6; white-space: pre-wrap;">${params.initialMessage}</div>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${portalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">
        View Ticket &amp; Live Chat &rarr;
      </a>
    </div>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: `Ticket ${params.ticketNumber}: ${params.ticketSubject}`,
    firmName: params.firmName,
    childrenHtml,
  });

  const text = `${subject}\n\nTicket: ${params.ticketNumber}\nClient: ${params.clientName}\nPriority: ${params.priority}\nCategory: ${params.category}\nSubject: ${params.ticketSubject}\n\nMessage:\n${params.initialMessage}\n\nView at: ${portalUrl}`;

  return { subject, html, text };
}

/**
 * Support Ticket Message / Reply Notification Template
 */
export function renderTicketReplyEmail(params: {
  ticketNumber: string;
  ticketSubject: string;
  clientName: string;
  authorName: string;
  isStaffReply: boolean;
  messageBody: string;
  portalUrl?: string;
  firmName?: string;
}): { subject: string; html: string; text: string } {
  const isStaff = params.isStaffReply;
  const portalUrl = params.portalUrl || "http://localhost:3000/portal/support";

  const subject = `Update on Ticket ${params.ticketNumber}: ${params.ticketSubject}`;

  const childrenHtml = `
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
      New Response on Ticket ${params.ticketNumber}
    </h1>
    <p style="margin: 0 0 20px 0;">
      <strong>${params.authorName}</strong> (${isStaff ? "RapidShift Support" : params.clientName}) posted a new response:
    </p>

    <div style="background-color: #f8fafc; border-left: 4px solid ${isStaff ? "#2563eb" : "#10b981"}; border-radius: 0 8px 8px 0; padding: 18px 20px; margin-bottom: 24px;">
      <div style="font-size: 13px; color: #1e293b; line-height: 1.6; white-space: pre-wrap;">${params.messageBody}</div>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${portalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">
        Reply on Live Portal Chat &rarr;
      </a>
    </div>

    <p style="margin: 0; font-size: 12px; color: #64748b;">
      Ticket Reference: <span style="font-family: monospace; font-weight: 600;">${params.ticketNumber}</span> &bull; ${params.ticketSubject}
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: `New reply from ${params.authorName} on ticket ${params.ticketNumber}.`,
    firmName: params.firmName,
    childrenHtml,
  });

  const text = `Update on Ticket ${params.ticketNumber}: ${params.ticketSubject}\n\n${params.authorName} (${isStaff ? "RapidShift Support" : params.clientName}) wrote:\n\n${params.messageBody}\n\nView and reply at: ${portalUrl}`;

  return { subject, html, text };
}

/**
 * Domain Monitoring Incident Alert Template
 */
export function renderDomainIncidentEmail(params: {
  domain: string;
  checkType: "http" | "ssl" | "dns";
  state: "opened" | "resolved";
  reason: string;
  clientName: string;
  timestampFormatted: string;
  firmName?: string;
}): { subject: string; html: string; text: string } {
  const isDown = params.state === "opened";
  const title = isDown
    ? `INCIDENT ALERT: ${params.domain} is DOWN`
    : `RESOLVED: ${params.domain} is Back UP`;

  const accentColor = isDown ? "#dc2626" : "#16a34a";
  const icon = isDown ? "&#9888;" : "&#10003;";

  const childrenHtml = `
    <div style="width: 42px; height: 42px; background-color: ${isDown ? "#fee2e2" : "#dcfce7"}; border-radius: 50%; text-align: center; line-height: 42px; color: ${accentColor}; font-size: 20px; margin-bottom: 16px;">
      ${icon}
    </div>
    <h1 style="margin: 0 0 14px 0; font-size: 20px; font-weight: 700; color: ${accentColor}; letter-spacing: -0.3px;">
      ${title}
    </h1>
    <p style="margin: 0 0 20px 0;">
      ${
        isDown
          ? `Automated health monitoring detected that <strong>${params.domain}</strong> has experienced consecutive service check failures.`
          : `Automated health monitoring reports that <strong>${params.domain}</strong> has recovered and is serving traffic normally.`
      }
    </p>

    <!-- Incident Details Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; padding: 18px 20px;">
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Monitored Host:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${params.domain}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Check Monitor:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 600; color: #0f172a; text-transform: uppercase;">${params.checkType}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Status:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: ${accentColor};">${isDown ? "TRIGGERED (DOWN)" : "RESOLVED (UP)"}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">Event Timestamp:</td>
        <td align="right" style="font-size: 12px; font-weight: 600; color: #0f172a;">${params.timestampFormatted}</td>
      </tr>
    </table>

    <div style="background-color: ${isDown ? "#fff1f2" : "#f0fdf4"}; border: 1px solid ${isDown ? "#fecdd3" : "#bbf7d0"}; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${accentColor}; margin-bottom: 4px;">Diagnostics &amp; Failure Reason</div>
      <div style="font-size: 13px; color: #1e293b;">${params.reason}</div>
    </div>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader: title,
    firmName: params.firmName,
    childrenHtml,
  });

  const text = `${title}\nHost: ${params.domain}\nType: ${params.checkType.toUpperCase()}\nStatus: ${isDown ? "DOWN" : "RESOLVED"}\nTimestamp: ${params.timestampFormatted}\nReason: ${params.reason}`;

  return { subject: `[${params.state.toUpperCase()}] ${params.domain} Monitoring: ${params.reason}`, html, text };
}

/**
 * Support Ticket SLA Escalation Alert Template
 */
export function renderTicketEscalationEmail(params: {
  ticketNumber: string;
  ticketSubject: string;
  clientName: string;
  priority: string;
  fromLevel: string;
  toLevel: string;
  reason: string;
  portalUrl?: string;
  firmName?: string;
}): { subject: string; html: string; text: string } {
  const portalUrl = params.portalUrl || "http://localhost:3000/portal/support";
  const isL3 = params.toLevel === "L3";
  const accentColor = isL3 ? "#b91c1c" : "#dc2626";
  const subject = `[SLA ESCALATION ${params.toLevel}] Ticket ${params.ticketNumber} (${params.priority}): ${params.ticketSubject}`;
  const preheader = `CRITICAL: Ticket ${params.ticketNumber} escalated to tier ${params.toLevel} due to SLA breach.`;

  const childrenHtml = `
    <div style="width: 44px; height: 44px; background-color: #fee2e2; border-radius: 50%; text-align: center; line-height: 44px; color: ${accentColor}; font-size: 22px; margin-bottom: 16px;">
      &#9888;
    </div>
    <h1 style="margin: 0 0 14px 0; font-size: 20px; font-weight: 700; color: ${accentColor}; letter-spacing: -0.3px;">
      Ticket Escalated to ${params.toLevel} (SLA Breach)
    </h1>
    <p style="margin: 0 0 18px 0; font-size: 14px; color: #334155; line-height: 1.6;">
      Ticket <strong>${params.ticketNumber}</strong> has exceeded its response or resolution SLA deadline and has been automatically escalated from <strong>${params.fromLevel}</strong> to <strong>${params.toLevel}</strong>.
    </p>

    <!-- Escalation Summary Card -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 20px; padding: 18px 20px;">
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Ticket Reference:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${params.ticketNumber}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Client:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 600; color: #0f172a;">${params.clientName}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Priority:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: ${accentColor};">${params.priority}</td>
      </tr>
      <tr>
        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b;">Escalation Tier:</td>
        <td align="right" style="padding-bottom: 8px; font-size: 13px; font-weight: 700; color: ${accentColor};">${params.fromLevel} &rarr; ${params.toLevel}</td>
      </tr>
      <tr>
        <td style="font-size: 12px; color: #64748b;">Subject:</td>
        <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.ticketSubject}</td>
      </tr>
    </table>

    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Escalation Reason</div>
      <div style="font-size: 13px; color: #1e293b; line-height: 1.5;">${params.reason}</div>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${portalUrl}" style="background-color: ${accentColor}; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">
        Take Immediate Action in Portal &rarr;
      </a>
    </div>

    <p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center;">
      This escalation notification was generated automatically by RapidShift SLA Daemon.
    </p>
  `;

  const html = wrapInBrandedEmailLayout({
    preheader,
    firmName: params.firmName,
    childrenHtml,
  });

  const text = `${subject}\n\nTicket: ${params.ticketNumber}\nClient: ${params.clientName}\nPriority: ${params.priority}\nEscalation: ${params.fromLevel} -> ${params.toLevel}\nReason: ${params.reason}\nSubject: ${params.ticketSubject}\n\nView at: ${portalUrl}`;

  return { subject, html, text };
}
