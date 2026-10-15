import { describe, it, expect } from "vitest";
import { GstCalculator } from "../src/modules/billing/domain/services/gst-calculator";

describe("GST Calculator & Tax Rules Unit Tests", () => {
  const firmGstin = "29ABCDE1234F1Z5";
  const firmState = "Karnataka";

  it("calculates zero tax for non-GST billing mode (domestic)", () => {
    const result = GstCalculator.calculate({
      billingMode: "non_gst",
      subtotalMinor: 100000, // ₹1,000.00
      gstRateBps: 1800,
      firmState,
      clientState: "Karnataka",
      clientCountry: "India",
      firmGstin,
    });

    expect(result.billingMode).toBe("non_gst");
    expect(result.taxType).toBe("none");
    expect(result.taxClassification).toBe("domestic_non_gst");
    expect(result.documentTitle).toBe("BILL OF SUPPLY");
    expect(result.placeOfSupply).toBe("Karnataka (29)");
    expect(result.cgstMinor).toBe(0);
    expect(result.sgstMinor).toBe(0);
    expect(result.igstMinor).toBe(0);
    expect(result.totalTaxMinor).toBe(0);
    expect(result.totalMinor).toBe(100000);
    expect(result.isExport).toBe(false);
  });

  it("calculates non-GST commercial export invoice for international clients", () => {
    const result = GstCalculator.calculate({
      billingMode: "non_gst",
      subtotalMinor: 250000,
      firmState,
      clientCountry: "United States",
      firmGstin,
    });

    expect(result.billingMode).toBe("non_gst");
    expect(result.taxType).toBe("none");
    expect(result.taxClassification).toBe("export_non_gst");
    expect(result.documentTitle).toBe("COMMERCIAL EXPORT INVOICE");
    expect(result.placeOfSupply).toContain("Outside India (United States, US)");
    expect(result.isExport).toBe(true);
    expect(result.totalTaxMinor).toBe(0);
    expect(result.jurisdictionTaxTerms.destinationCountry).toBe("United States");
  });

  it("calculates intra-state 50/50 CGST and SGST split when firm and client are in the same state", () => {
    const subtotalMinor = 100000; // ₹1,000.00
    const result = GstCalculator.calculate({
      billingMode: "gst",
      subtotalMinor,
      gstRateBps: 1800, // 18%
      firmState: "Karnataka",
      clientState: "Karnataka",
      clientCountry: "India",
      firmGstin,
    });

    expect(result.billingMode).toBe("gst");
    expect(result.taxType).toBe("intra_state");
    expect(result.taxClassification).toBe("intra_state_gst");
    expect(result.documentTitle).toBe("TAX INVOICE");
    expect(result.placeOfSupply).toBe("Karnataka (29)");
    expect(result.cgstRateBps).toBe(900); // 9%
    expect(result.sgstRateBps).toBe(900); // 9%
    expect(result.cgstMinor).toBe(9000); // ₹90.00
    expect(result.sgstMinor).toBe(9000); // ₹90.00
    expect(result.igstMinor).toBe(0);
    expect(result.totalTaxMinor).toBe(18000); // ₹180.00
    expect(result.totalMinor).toBe(118000); // ₹1,180.00
    expect(result.isExport).toBe(false);
  });

  it("calculates inter-state 100% IGST when client state differs from firm state", () => {
    const subtotalMinor = 200000; // ₹2,000.00
    const result = GstCalculator.calculate({
      billingMode: "gst",
      subtotalMinor,
      gstRateBps: 1800, // 18%
      firmState: "Karnataka",
      clientState: "Maharashtra",
      clientCountry: "India",
      firmGstin,
    });

    expect(result.billingMode).toBe("gst");
    expect(result.taxType).toBe("inter_state");
    expect(result.taxClassification).toBe("inter_state_gst");
    expect(result.documentTitle).toBe("TAX INVOICE");
    expect(result.placeOfSupply).toBe("Maharashtra (27)");
    expect(result.cgstMinor).toBe(0);
    expect(result.sgstMinor).toBe(0);
    expect(result.igstRateBps).toBe(1800); // 18%
    expect(result.igstMinor).toBe(36000); // ₹360.00
    expect(result.totalTaxMinor).toBe(36000);
    expect(result.totalMinor).toBe(236000); // ₹2,360.00
    expect(result.isExport).toBe(false);
  });

  it("calculates international export of services under LUT (0% GST zero-rated)", () => {
    const subtotalMinor = 500000; // $5,000 or ₹5,000
    const result = GstCalculator.calculate({
      billingMode: "gst",
      subtotalMinor,
      gstRateBps: 1800,
      firmState: "Karnataka",
      firmCountry: "India",
      clientCountry: "United States",
      firmGstin,
      lutNumber: "AD2903260000001",
    });

    expect(result.billingMode).toBe("gst");
    expect(result.taxType).toBe("export_lut");
    expect(result.taxClassification).toBe("export_services_lut");
    expect(result.documentTitle).toBe("TAX INVOICE (EXPORT OF SERVICES)");
    expect(result.placeOfSupply).toBe("Outside India (United States, US)");
    expect(result.isExport).toBe(true);
    expect(result.cgstMinor).toBe(0);
    expect(result.sgstMinor).toBe(0);
    expect(result.igstMinor).toBe(0);
    expect(result.totalTaxMinor).toBe(0);
    expect(result.totalMinor).toBe(500000);
    expect(result.exportDeclaration).toContain("LETTER OF UNDERTAKING (LUT) WITHOUT PAYMENT OF INTEGRATED TAX");
    expect(result.exportDeclaration).toContain("LUT ARN: AD2903260000001");
    expect(result.jurisdictionTaxTerms.destinationCountry).toBe("United States");
    expect(result.jurisdictionTaxTerms.withholdingTaxNote).toContain("W-8BEN-E");
  });

  it("calculates international export with payment of IGST when configured", () => {
    const subtotalMinor = 100000;
    const result = GstCalculator.calculate({
      billingMode: "gst",
      subtotalMinor,
      gstRateBps: 1800,
      firmCountry: "India",
      clientCountry: "United Kingdom",
      firmGstin,
      exportWithPayment: true,
    });

    expect(result.taxType).toBe("export_igst");
    expect(result.taxClassification).toBe("export_services_taxable");
    expect(result.documentTitle).toBe("TAX INVOICE (EXPORT OF SERVICES)");
    expect(result.placeOfSupply).toBe("Outside India (United Kingdom, GB)");
    expect(result.igstMinor).toBe(18000);
    expect(result.totalMinor).toBe(118000);
    expect(result.exportDeclaration).toBe("SUPPLY MEANT FOR EXPORT OF SERVICES ON PAYMENT OF INTEGRATED TAX");
    expect(result.jurisdictionTaxTerms.reverseChargeApplicable).toBe(true);
    expect(result.jurisdictionTaxTerms.reverseChargeClause).toContain("Section 8 of the Value Added Tax Act 1994");
  });

  it("provides EU Article 196 reverse charge clause for European Union clients", () => {
    const result = GstCalculator.calculate({
      billingMode: "gst",
      subtotalMinor: 100000,
      clientCountry: "Germany",
      firmGstin,
    });

    expect(result.isExport).toBe(true);
    expect(result.jurisdictionTaxTerms.governingAct).toContain("Directive 2006/112/EC");
    expect(result.jurisdictionTaxTerms.reverseChargeClause).toContain("Article 196 of EU Council Directive 2006/112/EC");
    expect(result.jurisdictionTaxTerms.reverseChargeApplicable).toBe(true);
  });

  it("provides UAE VAT Article 48 reverse charge clause for UAE clients", () => {
    const result = GstCalculator.calculate({
      billingMode: "gst",
      subtotalMinor: 100000,
      clientCountry: "United Arab Emirates",
      firmGstin,
    });

    expect(result.jurisdictionTaxTerms.governingAct).toContain("UAE Federal Decree-Law No. (8) of 2017");
    expect(result.jurisdictionTaxTerms.reverseChargeClause).toContain("Article 48");
    expect(result.jurisdictionTaxTerms.reverseChargeApplicable).toBe(true);
  });

  it("enforces GST settings gate: throws error if firm GSTIN is not configured", () => {
    expect(() => {
      GstCalculator.calculate({
        billingMode: "gst",
        subtotalMinor: 100000,
        gstRateBps: 1800,
        firmState: "Karnataka",
        clientState: "Karnataka",
        firmGstin: "", // missing firm GSTIN
      });
    }).toThrow("Firm GSTIN must be configured in company settings to generate GST invoices");
  });

  it("handles case-insensitive state matching", () => {
    const result = GstCalculator.calculate({
      billingMode: "gst",
      subtotalMinor: 50000,
      gstRateBps: 1800,
      firmState: "karnataka ",
      clientState: "KARNATAKA",
      firmGstin,
    });

    expect(result.taxType).toBe("intra_state");
    expect(result.cgstMinor).toBe(4500);
    expect(result.sgstMinor).toBe(4500);
    expect(result.igstMinor).toBe(0);
  });
});
