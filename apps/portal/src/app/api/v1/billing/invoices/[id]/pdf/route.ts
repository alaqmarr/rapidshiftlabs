export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { GstCalculator, type InvoicePdfData } from "@rsl/core/billing";
import { formatCurrency, amountInWords } from "@rsl/core/kernel";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTimestamp(ts: number | string | Date): string {
  const d = new Date(ts);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const container = getContainer();

    let invoice = await container.billingRepo.findInvoiceById(id);
    if (!invoice) {
      invoice = await container.billingRepo.findInvoiceByNumber(id);
    }

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (actor.kind === "client_user" || actor.kind === "api_key") {
      if (actor.clientId !== invoice.clientId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot access another client's invoice" },
          { status: 403 },
        );
      }
    } else if (actor.kind !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [companySettings, client] = await Promise.all([
      container.settingsRepo.getCompanySettings(),
      container.clientDirectoryRepo.findById(invoice.clientId),
    ]);

    const clientName = client?.name || "Client Organization";
    const clientGstin = client?.gstin || "";
    const clientPan = client?.pan || "";
    const clientAddress = [
      client?.addressLine1,
      client?.addressLine2,
      client?.city,
      client?.state,
      client?.postalCode,
      client?.country,
    ]
      .filter(Boolean)
      .join(", ");

    const firmAddress = [
      companySettings.addressLine1,
      companySettings.addressLine2,
      companySettings.city,
      companySettings.state,
      companySettings.postalCode,
      companySettings.country,
    ]
      .filter(Boolean)
      .join(", ");

    const currency = invoice.currency || client?.currency || "INR";
    const isPaid = invoice.status === "paid" || invoice.balanceMinor === 0;

    // Calculate statutory tax terms, place of supply, and export declarations
    const taxCalc = GstCalculator.calculate({
      billingMode: invoice.billingMode,
      subtotalMinor: invoice.subtotalMinor,
      gstRateBps: invoice.igstRateBps || (invoice.cgstRateBps ? invoice.cgstRateBps * 2 : 1800),
      firmState: companySettings.state,
      firmCountry: companySettings.country || "India",
      clientState: client?.state,
      clientCountry: client?.country || "India",
      firmGstin: companySettings.gstin || "29ABCDE1234F1Z5",
      lutNumber: companySettings.lutNumber,
      exportWithPayment: invoice.igstMinor > 0 && invoice.billingMode === "gst",
    });

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      billingMode: invoice.billingMode,
      status: invoice.status,
      issueDateFormatted: formatTimestamp(invoice.issueDate),
      dueDateFormatted: formatTimestamp(invoice.dueDate),
      currency,

      documentTitle: taxCalc.documentTitle,
      placeOfSupply: taxCalc.placeOfSupply,
      taxClassification: taxCalc.taxClassification,
      exportDeclaration: taxCalc.exportDeclaration,
      jurisdictionTaxTerms: taxCalc.jurisdictionTaxTerms,

      firmName: companySettings.legalName || "RapidShift Labs Private Limited",
      firmTradeName: companySettings.tradeName || "RapidShift Labs",
      firmGstin: companySettings.gstin || undefined,
      firmPan: companySettings.pan || undefined,
      firmAddress: firmAddress || "Bengaluru, Karnataka, India",
      firmState: companySettings.state,
      firmPostalCode: companySettings.postalCode,
      firmCountry: companySettings.country || "India",
      firmBankName: companySettings.bankName,
      firmAccountNumber: companySettings.accountNumber,
      firmIfsc: companySettings.ifsc,
      firmBranch: companySettings.branch,
      firmUpiId: companySettings.upiId,
      firmSwiftBic: companySettings.swiftBic,
      firmIban: companySettings.iban,
      firmLutNumber: companySettings.lutNumber,
      firmPhone: companySettings.phone,
      firmEmail: companySettings.email,

      clientName,
      clientGstin: clientGstin || undefined,
      clientPan: clientPan || undefined,
      clientAddress: clientAddress || undefined,
      clientState: client?.state || undefined,
      clientPostalCode: client?.postalCode || undefined,
      clientCountry: client?.country || undefined,

      items: invoice.lines.map((l) => ({
        description: l.description,
        sacCode: l.sacCode || "998311",
        quantity: l.quantity,
        unitPriceFormatted: formatCurrency(l.unitPriceMinor, currency, { forceDecimals: true }),
        amountFormatted: formatCurrency(l.amountMinor, currency, { forceDecimals: true }),
      })),

      subtotalFormatted: formatCurrency(invoice.subtotalMinor, currency, { forceDecimals: true }),
      cgstRateFormatted: invoice.cgstRateBps ? `${invoice.cgstRateBps / 100}%` : undefined,
      cgstFormatted: invoice.cgstMinor ? formatCurrency(invoice.cgstMinor, currency, { forceDecimals: true }) : undefined,
      sgstRateFormatted: invoice.sgstRateBps ? `${invoice.sgstRateBps / 100}%` : undefined,
      sgstFormatted: invoice.sgstMinor ? formatCurrency(invoice.sgstMinor, currency, { forceDecimals: true }) : undefined,
      igstRateFormatted: invoice.igstRateBps ? `${invoice.igstRateBps / 100}%` : undefined,
      igstFormatted: invoice.igstMinor ? formatCurrency(invoice.igstMinor, currency, { forceDecimals: true }) : undefined,
      totalFormatted: formatCurrency(invoice.totalMinor, currency, { forceDecimals: true }),
      balanceFormatted: formatCurrency(invoice.balanceMinor, currency, { forceDecimals: true }),
      amountInWords: amountInWords(invoice.totalMinor, currency),

      notes: invoice.notes || undefined,
      isPaid,
    };

    const pdfBuffer = await container.billingModule.pdfRenderer.renderInvoicePdf(pdfData);

    const safeFilename = `${invoice.invoiceNumber.replace(/[\/\\]/g, "-")}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error("[API] Error generating invoice PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate invoice PDF", details: String(error) },
      { status: 500 },
    );
  }
}
