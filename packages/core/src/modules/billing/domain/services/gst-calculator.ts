import { DomainRuleError } from "../../../../shared/kernel/errors";
import {
  INDIAN_STATES,
  SUPPORTED_COUNTRIES,
  findIndianState,
  isIndiaCountry,
} from "../../../../shared/kernel/validation";

export type TaxClassification =
  | "intra_state_gst"
  | "inter_state_gst"
  | "export_services_lut"
  | "export_services_taxable"
  | "domestic_non_gst"
  | "export_non_gst";

export interface JurisdictionTaxTerms {
  governingAct: string;
  reverseChargeApplicable: boolean;
  reverseChargeClause: string;
  withholdingTaxNote?: string | null;
  destinationCountry: string;
}

export interface GstCalculationInput {
  billingMode: "gst" | "non_gst";
  subtotalMinor: number;
  gstRateBps?: number; // e.g. 1800 (18.00%)
  firmState?: string | null;
  firmCountry?: string | null;
  clientState?: string | null;
  clientCountry?: string | null;
  firmGstin?: string | null;
  lutNumber?: string | null;
  exportWithPayment?: boolean;
}

export interface GstCalculationResult {
  billingMode: "gst" | "non_gst";
  subtotalMinor: number;
  cgstRateBps: number;
  cgstMinor: number;
  sgstRateBps: number;
  sgstMinor: number;
  igstRateBps: number;
  igstMinor: number;
  totalTaxMinor: number;
  totalMinor: number;
  taxType: "none" | "intra_state" | "inter_state" | "export_lut" | "export_igst";
  taxClassification: TaxClassification;
  documentTitle: "TAX INVOICE" | "TAX INVOICE (EXPORT OF SERVICES)" | "BILL OF SUPPLY" | "COMMERCIAL EXPORT INVOICE";
  placeOfSupply: string;
  isExport: boolean;
  exportDeclaration?: string | null;
  jurisdictionTaxTerms: JurisdictionTaxTerms;
}

function resolveCountryInfo(country?: string | null): { name: string; code: string; isIndia: boolean } {
  if (!country || country.trim().length === 0) {
    return { name: "India", code: "IN", isIndia: true };
  }
  const clean = country.trim();
  if (isIndiaCountry(clean)) {
    return { name: "India", code: "IN", isIndia: true };
  }
  const found = SUPPORTED_COUNTRIES.find(
    (c) =>
      c.code.toLowerCase() === clean.toLowerCase() ||
      c.name.toLowerCase() === clean.toLowerCase(),
  );
  if (found) {
    return { name: found.name, code: found.code, isIndia: false };
  }
  const code = clean.length === 2 ? clean.toUpperCase() : clean.slice(0, 3).toUpperCase();
  return { name: clean, code, isIndia: false };
}

function formatIndianStatePlaceOfSupply(stateNameOrCode?: string | null): string {
  if (!stateNameOrCode || stateNameOrCode.trim().length === 0) {
    return "Karnataka (29)";
  }
  const state = findIndianState(stateNameOrCode);
  if (state) {
    return `${state.name} (${state.code})`;
  }
  return stateNameOrCode.trim();
}

export function getJurisdictionTaxTerms(countryInfo: { name: string; code: string; isIndia: boolean }): JurisdictionTaxTerms {
  if (countryInfo.isIndia) {
    return {
      governingAct: "Central Goods and Services Tax Act, 2017 & Integrated GST Act, 2017",
      reverseChargeApplicable: false,
      reverseChargeClause:
        "Tax is payable on forward charge basis by the supplier. Reverse charge is NOT applicable under Section 9(3)/9(4) of the CGST Act.",
      destinationCountry: "India",
    };
  }

  const code = countryInfo.code.toUpperCase();
  switch (code) {
    case "US":
    case "USA":
      return {
        governingAct: "United States Internal Revenue Code (IRC) & State Sales Tax Regulations",
        reverseChargeApplicable: false,
        reverseChargeClause:
          "Cross-border digital export of professional/SaaS services performed outside the United States. Not subject to US State Sales or Use Tax. Services are utilized outside Indian taxable territory. Form W-8BEN-E certified for US-India DTAA treaty benefits.",
        withholdingTaxNote: "Form W-8BEN-E foreign entity certification applies for 0% US withholding tax under Article 12 of the US-India DTAA.",
        destinationCountry: countryInfo.name || "United States",
      };

    case "GB":
    case "UK":
      return {
        governingAct: "United Kingdom Value Added Tax Act 1994 (Section 7A & Section 8)",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Reverse Charge: Customer is required to account for UK VAT under Section 8 of the Value Added Tax Act 1994 on imported business-to-business (B2B) services.",
        destinationCountry: countryInfo.name || "United Kingdom",
      };

    case "DE":
    case "FR":
    case "NL":
    case "IE":
    case "ES":
    case "IT":
    case "SE":
    case "EU":
      return {
        governingAct: "European Union VAT Directive 2006/112/EC (Article 44 & Article 196)",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Reverse Charge: Value Added Tax (VAT) to be accounted for and settled by the recipient business in accordance with Article 196 of EU Council Directive 2006/112/EC. Place of supply governed by Article 44.",
        destinationCountry: countryInfo.name || "European Union",
      };

    case "AE":
    case "UAE":
      return {
        governingAct: "UAE Federal Decree-Law No. (8) of 2017 on Value Added Tax (Article 48)",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Reverse Charge Mechanism applies under Article 48 of UAE Federal Decree-Law No. (8) of 2017 on Value Added Tax. The recipient is registered and liable to account for VAT.",
        destinationCountry: countryInfo.name || "United Arab Emirates",
      };

    case "CA":
      return {
        governingAct: "Excise Tax Act (Canada), Part IX & Schedule VI",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Zero-rated supply under Part V of Schedule VI to the Excise Tax Act (Canada). The Canadian recipient is responsible for self-assessing any applicable provincial sales tax (PST/QST) or GST/HST on imported taxable supplies where required.",
        destinationCountry: countryInfo.name || "Canada",
      };

    case "AU":
      return {
        governingAct: "A New Tax System (Goods and Services Tax) Act 1999 (Section 38-190 & Division 84)",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "GST-free export of services pursuant to Section 38-190 of the Australian A New Tax System (Goods and Services Tax) Act 1999. Recipient is responsible for reverse charge under Division 84 if required.",
        destinationCountry: countryInfo.name || "Australia",
      };

    case "SG":
      return {
        governingAct: "Singapore Goods and Services Tax Act 1993 (Section 21(3) & Section 14)",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Zero-rated international services under Section 21(3) of the Singapore Goods and Services Tax Act. Recipient is liable to account for GST under Reverse Charge (Section 14) if applicable.",
        destinationCountry: countryInfo.name || "Singapore",
      };

    case "CH":
      return {
        governingAct: "Swiss Federal Act on Value Added Tax (VAT Act, Art. 8 & Art. 45)",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Cross-border supply of services. Place of supply is at the recipient's registered office under Article 8 of the Swiss VAT Act. Acquisition tax (Reverse Charge) applies under Article 45 if recipient is a taxable entity.",
        destinationCountry: countryInfo.name || "Switzerland",
      };

    case "JP":
      return {
        governingAct: "Japanese Consumption Tax Act (JCTA - Reverse Charge Mechanism)",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Reverse Charge Mechanism applies for B2B digital services provided by a foreign business entity pursuant to the Japanese Consumption Tax Act. The Japanese business recipient is responsible for reporting and paying Consumption Tax.",
        destinationCountry: countryInfo.name || "Japan",
      };

    default:
      return {
        governingAct: "International Cross-Border Digital Services & Local Destination Tax Laws",
        reverseChargeApplicable: true,
        reverseChargeClause:
          "Cross-border digital export of services. Services are performed and invoiced from India. Out of scope of Indian domestic GST under Section 16 of the IGST Act, 2017. The recipient entity is solely responsible for determining and remitting any local VAT, GST, consumption tax, or withholding taxes required under local laws.",
        destinationCountry: countryInfo.name || "International",
      };
  }
}

export class GstCalculator {
  static calculate(input: GstCalculationInput): GstCalculationResult {
    const {
      billingMode,
      subtotalMinor,
      gstRateBps = 1800,
      firmState,
      firmCountry,
      clientState,
      clientCountry,
      firmGstin,
      lutNumber,
      exportWithPayment = false,
    } = input;

    const firmCountryInfo = resolveCountryInfo(firmCountry);
    const clientCountryInfo = resolveCountryInfo(clientCountry);
    const isExport = firmCountryInfo.isIndia && !clientCountryInfo.isIndia;
    const jurisdictionTaxTerms = getJurisdictionTaxTerms(clientCountryInfo);

    if (billingMode === "non_gst") {
      const docTitle = isExport ? "COMMERCIAL EXPORT INVOICE" : "BILL OF SUPPLY";
      const placeOfSupply = isExport
        ? `Outside India (${clientCountryInfo.name}, ${clientCountryInfo.code})`
        : formatIndianStatePlaceOfSupply(clientState || firmState);

      return {
        billingMode: "non_gst",
        subtotalMinor,
        cgstRateBps: 0,
        cgstMinor: 0,
        sgstRateBps: 0,
        sgstMinor: 0,
        igstRateBps: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
        totalMinor: subtotalMinor,
        taxType: "none",
        taxClassification: isExport ? "export_non_gst" : "domestic_non_gst",
        documentTitle: docTitle,
        placeOfSupply,
        isExport,
        exportDeclaration: null,
        jurisdictionTaxTerms,
      };
    }

    // GST Settings Gate validation
    if (!firmGstin || firmGstin.trim().length === 0) {
      throw new DomainRuleError(
        "gst_firm_not_configured",
        "Firm GSTIN must be configured in company settings to generate GST invoices",
      );
    }

    if (isExport) {
      const placeOfSupply = `Outside India (${clientCountryInfo.name}, ${clientCountryInfo.code})`;

      if (exportWithPayment) {
        const igstRateBps = gstRateBps;
        const igstMinor = Math.round((subtotalMinor * igstRateBps) / 10000);

        return {
          billingMode: "gst",
          subtotalMinor,
          cgstRateBps: 0,
          cgstMinor: 0,
          sgstRateBps: 0,
          sgstMinor: 0,
          igstRateBps,
          igstMinor,
          totalTaxMinor: igstMinor,
          totalMinor: subtotalMinor + igstMinor,
          taxType: "export_igst",
          taxClassification: "export_services_taxable",
          documentTitle: "TAX INVOICE (EXPORT OF SERVICES)",
          placeOfSupply,
          isExport: true,
          exportDeclaration: "SUPPLY MEANT FOR EXPORT OF SERVICES ON PAYMENT OF INTEGRATED TAX",
          jurisdictionTaxTerms,
        };
      } else {
        const lutArnText =
          lutNumber && lutNumber.trim().length > 0
            ? ` - LUT ARN: ${lutNumber.trim()}`
            : "";

        return {
          billingMode: "gst",
          subtotalMinor,
          cgstRateBps: 0,
          cgstMinor: 0,
          sgstRateBps: 0,
          sgstMinor: 0,
          igstRateBps: 0,
          igstMinor: 0,
          totalTaxMinor: 0,
          totalMinor: subtotalMinor,
          taxType: "export_lut",
          taxClassification: "export_services_lut",
          documentTitle: "TAX INVOICE (EXPORT OF SERVICES)",
          placeOfSupply,
          isExport: true,
          exportDeclaration: `SUPPLY MEANT FOR EXPORT OF SERVICES UNDER LETTER OF UNDERTAKING (LUT) WITHOUT PAYMENT OF INTEGRATED TAX${lutArnText}`,
          jurisdictionTaxTerms,
        };
      }
    }

    // Domestic Indian GST Supply (Intra-State vs Inter-State)
    const normFirmState = (firmState || "").trim().toLowerCase();
    const normClientState = (clientState || "").trim().toLowerCase();

    // Intra-state when client state matches firm state, or when client state is unspecified
    const isIntraState =
      normFirmState.length > 0 &&
      normClientState.length > 0 &&
      normFirmState === normClientState;

    if (isIntraState || normClientState.length === 0) {
      const halfRate = Math.floor(gstRateBps / 2);
      const cgstRateBps = halfRate;
      const sgstRateBps = gstRateBps - halfRate;

      const cgstMinor = Math.round((subtotalMinor * cgstRateBps) / 10000);
      const sgstMinor = Math.round((subtotalMinor * sgstRateBps) / 10000);
      const totalTaxMinor = cgstMinor + sgstMinor;
      const placeOfSupply = formatIndianStatePlaceOfSupply(firmState || clientState);

      return {
        billingMode: "gst",
        subtotalMinor,
        cgstRateBps,
        cgstMinor,
        sgstRateBps,
        sgstMinor,
        igstRateBps: 0,
        igstMinor: 0,
        totalTaxMinor,
        totalMinor: subtotalMinor + totalTaxMinor,
        taxType: "intra_state",
        taxClassification: "intra_state_gst",
        documentTitle: "TAX INVOICE",
        placeOfSupply,
        isExport: false,
        exportDeclaration: null,
        jurisdictionTaxTerms,
      };
    } else {
      const igstRateBps = gstRateBps;
      const igstMinor = Math.round((subtotalMinor * igstRateBps) / 10000);
      const placeOfSupply = formatIndianStatePlaceOfSupply(clientState);

      return {
        billingMode: "gst",
        subtotalMinor,
        cgstRateBps: 0,
        cgstMinor: 0,
        sgstRateBps: 0,
        sgstMinor: 0,
        igstRateBps,
        igstMinor,
        totalTaxMinor: igstMinor,
        totalMinor: subtotalMinor + igstMinor,
        taxType: "inter_state",
        taxClassification: "inter_state_gst",
        documentTitle: "TAX INVOICE",
        placeOfSupply,
        isExport: false,
        exportDeclaration: null,
        jurisdictionTaxTerms,
      };
    }
  }
}
