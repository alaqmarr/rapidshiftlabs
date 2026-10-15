import { Invoice, type CreateInvoiceParams } from "../../domain/entities/invoice.entity";
import type { BillingRepository } from "../../domain/repositories/billing-repository.port";
import { GstCalculator } from "../../domain/services/gst-calculator";

export interface FirmSettingsProvider {
  getCompanySettings(): Promise<{
    gstin?: string;
    state?: string;
    country?: string;
    lutNumber?: string;
  }>;
}

export interface ClientStateProvider {
  findById(id: string): Promise<{
    state?: string | null;
    country?: string | null;
    billingMode?: string;
  } | null>;
}

export class CreateManualInvoiceUseCase {
  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly settingsProvider?: FirmSettingsProvider,
    private readonly clientProvider?: ClientStateProvider,
  ) {}

  async execute(params: CreateInvoiceParams): Promise<Invoice> {
    const lines = params.lines || [];
    const subtotalMinor = lines.reduce(
      (sum, l) => sum + (l.quantity ?? 1) * l.unitPriceMinor,
      0,
    );

    let billingMode = params.billingMode || "non_gst";
    let clientState: string | null | undefined = null;
    let clientCountry: string | null | undefined = null;

    if (this.clientProvider) {
      const client = await this.clientProvider.findById(params.clientId);
      if (client) {
        if (!params.billingMode && client.billingMode) {
          billingMode = client.billingMode as any;
        }
        clientState = client.state;
        clientCountry = client.country;
      }
    }

    let firmState = "Karnataka";
    let firmCountry = "India";
    let firmGstin = "";
    let lutNumber = "";
    if (this.settingsProvider) {
      const company = await this.settingsProvider.getCompanySettings();
      firmState = company.state || "Karnataka";
      firmCountry = company.country || "India";
      firmGstin = company.gstin || "";
      lutNumber = company.lutNumber || "";
    }

    // Calculate taxes
    const taxCalc = GstCalculator.calculate({
      billingMode,
      subtotalMinor,
      gstRateBps: 1800,
      firmState,
      firmCountry,
      clientState,
      clientCountry,
      firmGstin,
      lutNumber,
    });

    const invoice = Invoice.create({
      ...params,
      billingMode,
      cgstRateBps: taxCalc.cgstRateBps,
      cgstMinor: taxCalc.cgstMinor,
      sgstRateBps: taxCalc.sgstRateBps,
      sgstMinor: taxCalc.sgstMinor,
      igstRateBps: taxCalc.igstRateBps,
      igstMinor: taxCalc.igstMinor,
    });

    await this.billingRepo.saveInvoice(invoice);
    return invoice;
  }
}
