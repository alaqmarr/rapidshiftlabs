export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import type { ContractPdfData } from "@rsl/core/contracts";
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
    const { id } = await context.params;
    const container = getContainer();

    const contract = await container.contractRepo.findById(id);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const [companySettings, client, contacts] = await Promise.all([
      container.settingsRepo.getCompanySettings(),
      container.clientDirectoryRepo.findById(contract.clientId),
      container.clientDirectoryRepo.findContactsByClient(contract.clientId),
    ]);

    const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];
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

    const currency = contract.currency || client?.currency || "INR";

    const pdfData: ContractPdfData = {
      contractId: contract.id,
      code: contract.code,
      title: contract.title,
      status: contract.status,
      validFromFormatted: formatTimestamp(contract.validFrom),
      validToFormatted: formatTimestamp(contract.validTo),
      billingCycle: contract.billingCycle,
      currency,
      retainerFormatted: formatCurrency(contract.amountMinor, currency, { forceDecimals: true }),
      amountInWords: amountInWords(contract.amountMinor, currency),
      paymentTermsDays: contract.paymentTermsDays,
      graceDays: contract.graceDays,
      taxProfile: contract.taxProfile,
      gstRateFormatted: `${contract.gstRateBps / 100}%`,

      firmName: companySettings.legalName || "RapidShift Labs Private Limited",
      firmTradeName: companySettings.tradeName || "RapidShift Labs",
      firmAddress: firmAddress || "Bengaluru, Karnataka, India",
      firmState: companySettings.state,
      firmCountry: companySettings.country || "India",
      firmGstin: companySettings.gstin || undefined,
      firmPan: companySettings.pan || undefined,
      firmBankName: companySettings.bankName,
      firmAccountNumber: companySettings.accountNumber,
      firmIfsc: companySettings.ifsc,
      firmBranch: companySettings.branch,
      firmSwiftBic: companySettings.swiftBic,
      firmIban: companySettings.iban,
      firmUpiId: companySettings.upiId,
      firmLutNumber: companySettings.lutNumber,
      firmEmail: companySettings.email,
      firmPhone: companySettings.phone,

      clientName,
      clientAddress: clientAddress || undefined,
      clientState: client?.state || undefined,
      clientCountry: client?.country || undefined,
      clientGstin: clientGstin || undefined,
      clientPan: clientPan || undefined,
      clientContactName: primaryContact?.name,
      clientContactEmail: primaryContact?.email,

      items: contract.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        amountFormatted: formatCurrency(it.amountMinor * it.quantity, currency, { forceDecimals: true }),
      })),
      notes: contract.notes || undefined,
    };

    const pdfBuffer = await container.contractsModule.pdfRenderer.renderContractPdf(pdfData);

    const safeFilename = `${contract.code.replace(/[\/\\]/g, "-")}-Agreement.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error("[API] Error generating contract PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate contract PDF", details: String(error) },
      { status: 500 },
    );
  }
}
