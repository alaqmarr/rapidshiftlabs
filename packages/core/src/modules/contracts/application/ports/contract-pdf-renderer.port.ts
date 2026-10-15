export interface ContractPdfItemDTO {
  description: string;
  quantity: number;
  amountFormatted: string;
}

export interface ContractPdfData {
  contractId: string;
  code: string;
  title: string;
  status: string;
  validFromFormatted: string;
  validToFormatted: string;
  billingCycle: string;
  currency: string;
  retainerFormatted: string;
  amountInWords?: string;
  paymentTermsDays: number;
  graceDays: number;
  taxProfile: string;
  gstRateFormatted?: string;

  // Firm Info (Service Provider)
  firmName: string;
  firmTradeName?: string;
  firmAddress: string;
  firmState?: string;
  firmCountry?: string;
  firmGstin?: string;
  firmPan?: string;
  firmBankName?: string;
  firmAccountNumber?: string;
  firmIfsc?: string;
  firmBranch?: string;
  firmSwiftBic?: string;
  firmIban?: string;
  firmUpiId?: string;
  firmLutNumber?: string;
  firmEmail?: string;
  firmPhone?: string;

  // Client Info (Customer)
  clientName: string;
  clientAddress?: string;
  clientState?: string;
  clientCountry?: string;
  clientGstin?: string;
  clientPan?: string;
  clientContactName?: string;
  clientContactEmail?: string;

  governingLawClause?: string;
  items: ContractPdfItemDTO[];
  notes?: string;
}

export interface ContractPdfRendererPort {
  renderContractPdf(data: ContractPdfData): Promise<Buffer>;
}
