import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  ContractPdfRendererPort,
  ContractPdfData,
} from "../../application/ports/contract-pdf-renderer.port";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    paddingTop: 34,
    paddingBottom: 42,
    paddingHorizontal: 38,
    color: "#1e293b",
    backgroundColor: "#ffffff",
    lineHeight: 1.4,
  },
  topAccentBar: {
    height: 4,
    backgroundColor: "#2563eb",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  brandBox: {
    width: "55%",
  },
  brandLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  logoBadge: {
    width: 24,
    height: 24,
    backgroundColor: "#2563eb",
    borderRadius: 5,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBadgeText: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
  },
  brandTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 7.5,
    color: "#64748b",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  contractMetaBox: {
    width: "42%",
    alignItems: "flex-end",
  },
  docType: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  contractCode: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 3,
    backgroundColor: "#dbeafe",
    marginBottom: 4,
  },
  statusText: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#1d4ed8",
    letterSpacing: 0.5,
  },

  // Parties Box
  partiesContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  partyCard: {
    width: "48%",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 9,
  },
  partyRole: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 2,
  },
  partyName: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  partyAddress: {
    fontSize: 7.5,
    color: "#475569",
    lineHeight: 1.3,
  },
  partyTaxRow: {
    marginTop: 4,
    fontSize: 7.5,
    color: "#334155",
    fontFamily: "Helvetica-Bold",
  },

  // Section Block
  sectionBlock: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  sectionNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#2563eb",
    marginRight: 6,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bodyParagraph: {
    fontSize: 7.5,
    color: "#334155",
    lineHeight: 1.4,
    marginBottom: 6,
    paddingHorizontal: 4,
  },

  // Highlight Grid (Commercial Terms)
  commercialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 10,
  },
  commercialCell: {
    width: "50%",
    padding: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  commercialCellAlt: {
    backgroundColor: "#f8fafc",
  },
  cellLabel: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 1.5,
  },
  cellValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },

  // SLA Table
  slaTable: {
    width: "100%",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 10,
  },
  slaHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  slaRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  slaColSev: { width: "25%", fontFamily: "Helvetica-Bold", fontSize: 7, color: "#0f172a" },
  slaColDesc: { width: "45%", fontSize: 7, color: "#334155" },
  slaColTime: { width: "30%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 7, color: "#2563eb" },
  slaColTextHeader: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#ffffff" },

  // Deliverables Scope Table
  itemsTable: {
    width: "100%",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 8,
  },
  itemsHeader: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
  },
  itemsRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
  },
  colItemDesc: { width: "65%", fontSize: 7, color: "#334155" },
  colItemQty: { width: "15%", textAlign: "center", fontSize: 7, color: "#334155" },
  colItemAmt: { width: "20%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 7, color: "#0f172a" },

  // Bank and Legal Card
  bankCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 5,
    padding: 6,
    marginBottom: 8,
  },
  bankHeading: {
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  bankItem: {
    fontSize: 7,
    color: "#334155",
    lineHeight: 1.3,
  },
  legalCard: {
    backgroundColor: "#eff6ff",
    borderWidth: 0.5,
    borderColor: "#bfdbfe",
    borderRadius: 4,
    padding: 5,
    marginBottom: 8,
  },
  legalHeading: {
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    color: "#1d4ed8",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  legalText: {
    fontSize: 6.5,
    color: "#1e3a8a",
    lineHeight: 1.25,
  },

  // Execution & Signatures
  signatureSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
  },
  signaturePrompt: {
    fontSize: 7.5,
    color: "#475569",
    marginBottom: 12,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatoryCard: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
  signLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    height: 35,
    marginBottom: 6,
  },
  signPartyTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  signMeta: {
    fontSize: 7,
    color: "#64748b",
    marginTop: 1,
  },
  stampBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderStyle: "dashed",
    borderRadius: 3,
    padding: 3,
    backgroundColor: "#eff6ff",
    alignItems: "center",
  },
  stampText: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 18,
    left: 38,
    right: 38,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 6.5,
    color: "#94a3b8",
  },
});

export class ReactPdfContractRenderer implements ContractPdfRendererPort {
  async renderContractPdf(data: ContractPdfData): Promise<Buffer> {
    const cycleMap: Record<string, string> = {
      monthly: "Monthly Retainer",
      quarterly: "Quarterly Retainer",
      half_yearly: "Half-Yearly Retainer",
      yearly: "Annual Retainer",
      one_time: "One-Time Project",
      milestone: "Milestone-Based",
      every_n_days: "Recurring Cycle",
    };
    const cycleLabel = cycleMap[data.billingCycle] || data.billingCycle;

    const doc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: "A4", style: styles.page },

        // Top Accent Bar
        React.createElement(View, { style: styles.topAccentBar }),

        // Header
        React.createElement(
          View,
          { style: styles.header },
          React.createElement(
            View,
            { style: styles.brandBox },
            React.createElement(
              View,
              { style: styles.brandLogoRow },
              React.createElement(
                View,
                { style: styles.logoBadge },
                React.createElement(Text, { style: styles.logoBadgeText }, "R"),
              ),
              React.createElement(
                View,
                null,
                React.createElement(Text, { style: styles.brandTitle }, data.firmTradeName || data.firmName),
                React.createElement(Text, { style: styles.brandSubtitle }, "Cloud & Platform Control Plane"),
              ),
            ),
            React.createElement(Text, { style: styles.partyAddress }, data.firmAddress),
            React.createElement(
              Text,
              { style: [styles.partyAddress, { marginTop: 2 }] },
              [data.firmEmail, data.firmPhone].filter(Boolean).join("  •  "),
            ),
          ),
          React.createElement(
            View,
            { style: styles.contractMetaBox },
            React.createElement(Text, { style: styles.docType }, "MASTER SERVICE AGREEMENT"),
            React.createElement(Text, { style: styles.contractCode }, data.code),
            React.createElement(
              View,
              { style: styles.statusBadge },
              React.createElement(Text, { style: styles.statusText }, data.status.toUpperCase()),
            ),
            React.createElement(
              Text,
              { style: [styles.partyAddress, { marginTop: 3 }] },
              `Tenure: ${data.validFromFormatted} to ${data.validToFormatted}`,
            ),
          ),
        ),

        // Parties Overview
        React.createElement(
          View,
          { style: styles.partiesContainer },
          React.createElement(
            View,
            { style: styles.partyCard },
            React.createElement(Text, { style: styles.partyRole }, "Service Provider"),
            React.createElement(Text, { style: styles.partyName }, data.firmName),
            React.createElement(Text, { style: styles.partyAddress }, data.firmAddress),
            data.firmGstin ? React.createElement(Text, { style: styles.partyTaxRow }, `GSTIN: ${data.firmGstin}`) : null,
            data.firmPan ? React.createElement(Text, { style: styles.partyTaxRow }, `PAN: ${data.firmPan}`) : null,
            data.firmCountry ? React.createElement(Text, { style: [styles.partyAddress, { marginTop: 2, color: "#2563eb" }] }, `Jurisdiction: ${data.firmState || "Karnataka"}, ${data.firmCountry}`) : null,
          ),
          React.createElement(
            View,
            { style: styles.partyCard },
            React.createElement(Text, { style: styles.partyRole }, "Client Organization"),
            React.createElement(Text, { style: styles.partyName }, data.clientName),
            React.createElement(Text, { style: styles.partyAddress }, data.clientAddress || "Address on record"),
            data.clientGstin ? React.createElement(Text, { style: styles.partyTaxRow }, `GSTIN: ${data.clientGstin}`) : null,
            data.clientPan ? React.createElement(Text, { style: styles.partyTaxRow }, `PAN: ${data.clientPan}`) : null,
            data.clientCountry ? React.createElement(Text, { style: [styles.partyAddress, { marginTop: 2, color: "#2563eb" }] }, `Country/State: ${data.clientState || ""}${data.clientState && data.clientCountry ? ", " : ""}${data.clientCountry}`) : null,
            data.clientContactName ? React.createElement(Text, { style: styles.partyAddress }, `Contact: ${data.clientContactName}`) : null,
          ),
        ),

        // Section 1: Preamble & Scope
        React.createElement(
          View,
          { style: styles.sectionBlock },
          React.createElement(
            View,
            { style: styles.sectionHeader },
            React.createElement(Text, { style: styles.sectionNumber }, "1.0"),
            React.createElement(Text, { style: styles.sectionTitle }, "Scope of Managed Infrastructure Services"),
          ),
          React.createElement(
            Text,
            { style: styles.bodyParagraph },
            `This Master Services Agreement ("Agreement") governs the provision of cloud infrastructure operations, PM2 process supervision, continuous uptime/SSL monitoring, automated dunning, and service-layer access gating by RapidShift Labs for ${data.clientName} ("Client") regarding ${data.title}.`,
          ),
        ),

        // Section 2: Commercial & Billing Terms
        React.createElement(
          View,
          { style: styles.sectionBlock },
          React.createElement(
            View,
            { style: styles.sectionHeader },
            React.createElement(Text, { style: styles.sectionNumber }, "2.0"),
            React.createElement(Text, { style: styles.sectionTitle }, "Commercial Retainer & Billing Schedule"),
          ),
          React.createElement(
            View,
            { style: styles.commercialGrid },
            React.createElement(
              View,
              { style: styles.commercialCell },
              React.createElement(Text, { style: styles.cellLabel }, "Recurring Retainer Fee"),
              React.createElement(Text, { style: styles.cellValue }, data.retainerFormatted),
            ),
            React.createElement(
              View,
              { style: [styles.commercialCell, styles.commercialCellAlt] },
              React.createElement(Text, { style: styles.cellLabel }, "Billing Cycle"),
              React.createElement(Text, { style: styles.cellValue }, cycleLabel),
            ),
            React.createElement(
              View,
              { style: styles.commercialCell },
              React.createElement(Text, { style: styles.cellLabel }, "Payment Terms Window"),
              React.createElement(Text, { style: styles.cellValue }, `${data.paymentTermsDays} Days from Invoice Date`),
            ),
            React.createElement(
              View,
              { style: [styles.commercialCell, styles.commercialCellAlt] },
              React.createElement(Text, { style: styles.cellLabel }, "Dunning Grace Period"),
              React.createElement(Text, { style: styles.cellValue }, `${data.graceDays} Days before Gating`),
            ),
          ),
          data.amountInWords
            ? React.createElement(
                Text,
                { style: [styles.bodyParagraph, { fontFamily: "Helvetica-Bold", color: "#1e40af" }] },
                `Retainer Amount in Words: ${data.amountInWords}`,
              )
            : null,

          data.items && data.items.length > 0
            ? React.createElement(
                View,
                { style: styles.itemsTable },
                React.createElement(
                  View,
                  { style: styles.itemsHeader },
                  React.createElement(Text, { style: [styles.slaColTextHeader, styles.colItemDesc] }, "Contract Deliverable / Scope Item"),
                  React.createElement(Text, { style: [styles.slaColTextHeader, styles.colItemQty] }, "Quantity"),
                  React.createElement(Text, { style: [styles.slaColTextHeader, styles.colItemAmt] }, "Amount"),
                ),
                data.items.map((it, idx) =>
                  React.createElement(
                    View,
                    { key: idx, style: styles.itemsRow },
                    React.createElement(Text, { style: styles.colItemDesc }, it.description),
                    React.createElement(Text, { style: styles.colItemQty }, String(it.quantity)),
                    React.createElement(Text, { style: styles.colItemAmt }, it.amountFormatted),
                  ),
                ),
              )
            : null,

          data.firmBankName
            ? React.createElement(
                View,
                { style: styles.bankCard },
                React.createElement(Text, { style: styles.bankHeading }, "Official Settlement & Wire Remittance Details"),
                React.createElement(
                  Text,
                  { style: styles.bankItem },
                  [
                    data.firmBankName ? `Bank: ${data.firmBankName}` : null,
                    data.firmAccountNumber ? `A/C: ${data.firmAccountNumber}` : null,
                    data.firmIfsc ? `IFSC: ${data.firmIfsc}` : null,
                    data.firmBranch ? `Branch: ${data.firmBranch}` : null,
                  ].filter(Boolean).join("  •  "),
                ),
                data.firmSwiftBic || data.firmIban || data.firmLutNumber || data.firmUpiId
                  ? React.createElement(
                      Text,
                      { style: [styles.bankItem, { marginTop: 2 }] },
                      [
                        data.firmSwiftBic ? `SWIFT / BIC: ${data.firmSwiftBic}` : null,
                        data.firmIban ? `IBAN: ${data.firmIban}` : null,
                        data.firmUpiId ? `UPI: ${data.firmUpiId}` : null,
                        data.firmLutNumber ? `LUT ARN: ${data.firmLutNumber}` : null,
                      ].filter(Boolean).join("  •  "),
                    )
                  : null,
              )
            : null,
        ),

        // Section 3: SLA Commitments
        React.createElement(
          View,
          { style: styles.sectionBlock },
          React.createElement(
            View,
            { style: styles.sectionHeader },
            React.createElement(Text, { style: styles.sectionNumber }, "3.0"),
            React.createElement(Text, { style: styles.sectionTitle }, "Service Level Agreement (SLA) & Incident Response"),
          ),
          React.createElement(
            View,
            { style: styles.slaTable },
            React.createElement(
              View,
              { style: styles.slaHeader },
              React.createElement(Text, { style: [styles.slaColTextHeader, styles.slaColSev] }, "Severity Tier"),
              React.createElement(Text, { style: [styles.slaColTextHeader, styles.slaColDesc] }, "Description"),
              React.createElement(Text, { style: [styles.slaColTextHeader, styles.slaColTime] }, "Response SLA Target"),
            ),
            React.createElement(
              View,
              { style: styles.slaRow },
              React.createElement(Text, { style: styles.slaColSev }, "Level 1 (Critical)"),
              React.createElement(Text, { style: styles.slaColDesc }, "Service total outage / Production server failure"),
              React.createElement(Text, { style: styles.slaColTime }, "< 1 Hour (24x7)"),
            ),
            React.createElement(
              View,
              { style: [styles.slaRow, { backgroundColor: "#f8fafc" }] },
              React.createElement(Text, { style: styles.slaColSev }, "Level 2 (Major)"),
              React.createElement(Text, { style: styles.slaColDesc }, "Core feature degradation or SSL certificate warning"),
              React.createElement(Text, { style: styles.slaColTime }, "< 4 Hours"),
            ),
            React.createElement(
              View,
              { style: styles.slaRow },
              React.createElement(Text, { style: styles.slaColSev }, "Level 3 (Normal)"),
              React.createElement(Text, { style: styles.slaColDesc }, "General technical query, configuration adjustments"),
              React.createElement(Text, { style: styles.slaColTime }, "< 12 Hours"),
            ),
          ),
        ),

        // Section 4: Terms, Access Gating & Execution
        React.createElement(
          View,
          { style: styles.sectionBlock },
          React.createElement(
            View,
            { style: styles.sectionHeader },
            React.createElement(Text, { style: styles.sectionNumber }, "4.0"),
            React.createElement(Text, { style: styles.sectionTitle }, "Terms, Default & Execution"),
          ),
          React.createElement(
            Text,
            { style: styles.bodyParagraph },
            "Invoices remaining unsettled past the payment terms and grace period shall trigger the automated RapidShift Service Access Gate. Both parties agree that this electronic document constitutes a valid and binding contract between the parties upon activation.",
          ),
          React.createElement(
            View,
            { style: styles.legalCard },
            React.createElement(Text, { style: styles.legalHeading }, "Governing Law, Jurisdiction & Cross-Border Terms"),
            React.createElement(
              Text,
              { style: styles.legalText },
              data.governingLawClause ||
                (data.clientCountry && data.clientCountry.toLowerCase() !== "india" && data.clientCountry.toUpperCase() !== "IN"
                  ? "Cross-Border Provision: Governed by the laws of India. Any dispute arising out of or in connection with this contract shall be settled by binding arbitration in Bengaluru in the English language under the Arbitration and Conciliation Act, 1996. The supply of digital infrastructure services constitutes an export of services zero-rated under Section 16 of the IGST Act, 2017. Withholding taxes and treaty benefits are governed by bilateral Double Taxation Avoidance Agreements (DTAA)."
                  : "Domestic Provision: This contract shall be governed by and construed in accordance with the substantive laws of India. The parties irrevocably submit to the exclusive jurisdiction of the competent civil courts at Bengaluru, Karnataka for any disputes arising under this agreement."),
            ),
          ),
        ),

        // Signatures
        React.createElement(
          View,
          { style: styles.signatureSection },
          React.createElement(
            View,
            { style: styles.signatureRow },
            React.createElement(
              View,
              { style: styles.signatoryCard },
              React.createElement(View, { style: styles.signLine }),
              React.createElement(Text, { style: styles.signPartyTitle }, `For ${data.firmName}`),
              React.createElement(Text, { style: styles.signMeta }, "Authorized Officer • Cloud Infrastructure Operations"),
              React.createElement(
                View,
                { style: styles.stampBox },
                React.createElement(Text, { style: styles.stampText }, "DIGITALLY VERIFIED • RAPIDSHIFT CONTROL PLANE"),
              ),
            ),
            React.createElement(
              View,
              { style: styles.signatoryCard },
              React.createElement(View, { style: styles.signLine }),
              React.createElement(Text, { style: styles.signPartyTitle }, `For ${data.clientName}`),
              React.createElement(Text, { style: styles.signMeta }, data.clientContactName ? `Authorized Signatory: ${data.clientContactName}` : "Authorized Client Representative"),
              React.createElement(Text, { style: [styles.signMeta, { marginTop: 4 }] }, `Effective From: ${data.validFromFormatted}`),
            ),
          ),
        ),

        // Footer
        React.createElement(
          View,
          { style: styles.footer },
          React.createElement(
            Text,
            { style: styles.footerText },
            `RapidShift Master Service Agreement • Contract Ref: ${data.code} • Page 1 of 1`,
          ),
          React.createElement(
            Text,
            { style: styles.footerText },
            `Confidential & Proprietary`,
          ),
        ),
      ),
    );

    return renderToBuffer(doc);
  }
}
