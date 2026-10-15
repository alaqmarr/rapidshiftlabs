export interface InvoicePdfItemDTO {
  description: string;
  sacCode: string;
  quantity: number;
  unitPriceFormatted: string;
  amountFormatted: string;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  billingMode: "gst" | "non_gst";
  status: string;
  issueDateFormatted: string;
  dueDateFormatted: string;
  currency: string;

  // Statutory & International Tax Fields
  documentTitle?: string;
  placeOfSupply?: string;
  taxClassification?: string;
  exportDeclaration?: string | null;
  jurisdictionTaxTerms?: {
    governingAct: string;
    reverseChargeApplicable: boolean;
    reverseChargeClause: string;
    withholdingTaxNote?: string | null;
    destinationCountry: string;
  };

  // Firm Info from Settings
  firmName: string;
  firmTradeName?: string;
  firmGstin?: string;
  firmPan?: string;
  firmAddress: string;
  firmState?: string;
  firmPostalCode?: string;
  firmCountry?: string;
  firmBankName?: string;
  firmAccountNumber?: string;
  firmIfsc?: string;
  firmBranch?: string;
  firmUpiId?: string;
  firmSwiftBic?: string;
  firmIban?: string;
  firmLutNumber?: string;
  firmPhone?: string;
  firmEmail?: string;

  // Client Info
  clientName: string;
  clientGstin?: string;
  clientPan?: string;
  clientAddress?: string;
  clientState?: string;
  clientPostalCode?: string;
  clientCountry?: string;
  clientContactName?: string;
  clientContactEmail?: string;

  // Items
  items: InvoicePdfItemDTO[];

  // Totals
  subtotalFormatted: string;
  cgstRateFormatted?: string;
  cgstFormatted?: string;
  sgstRateFormatted?: string;
  sgstFormatted?: string;
  igstRateFormatted?: string;
  igstFormatted?: string;
  totalFormatted: string;
  balanceFormatted: string;
  amountInWords?: string;

  notes?: string;
  isPaid?: boolean;
  paymentReference?: string;
}

export interface PdfRendererPort {
  renderInvoicePdf(data: InvoicePdfData): Promise<Buffer>;
}
