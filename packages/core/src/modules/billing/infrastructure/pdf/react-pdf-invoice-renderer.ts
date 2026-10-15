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
  PdfRendererPort,
  InvoicePdfData,
} from "../../application/ports/pdf-renderer.port";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 36,
    color: "#1e293b",
    backgroundColor: "#ffffff",
    lineHeight: 1.35,
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
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  brandContainer: {
    width: "55%",
  },
  brandLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
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
  brandName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 1,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  firmAddressBlock: {
    marginTop: 6,
    fontSize: 7.5,
    color: "#475569",
    lineHeight: 1.3,
  },
  firmTaxRow: {
    flexDirection: "row",
    marginTop: 4,
    fontSize: 7.5,
    color: "#334155",
  },
  invoiceBadgeBox: {
    width: "42%",
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  invoiceNumber: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 6,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 8,
    alignSelf: "flex-end",
  },
  statusBadgeText: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  metaGrid: {
    alignSelf: "stretch",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 6,
    marginTop: 4,
  },
  metaGridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1.5,
  },
  metaGridLabel: {
    fontSize: 7.5,
    color: "#64748b",
  },
  metaGridValue: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },

  // Two column address section
  partySection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  partyCard: {
    width: "48%",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
  },
  partyHeading: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 3,
  },
  partyName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 3,
  },
  partyText: {
    fontSize: 7.5,
    color: "#475569",
    lineHeight: 1.3,
  },
  partyTaxRow: {
    marginTop: 4,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
  },
  partyTaxItem: {
    fontSize: 7.5,
    color: "#334155",
    fontFamily: "Helvetica-Bold",
  },

  // Table styles
  table: {
    width: "100%",
    marginBottom: 14,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  thText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  colNo: { width: "6%", textAlign: "center" },
  colDesc: { width: "44%" },
  colSac: { width: "14%", textAlign: "center" },
  colQty: { width: "10%", textAlign: "center" },
  colRate: { width: "13%", textAlign: "right" },
  colAmt: { width: "13%", textAlign: "right" },

  cellText: {
    fontSize: 7.5,
    color: "#334155",
  },
  cellTextBold: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },

  // Summary & Totals
  summaryContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  wordsAndBankBox: {
    width: "52%",
  },
  wordsCard: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  wordsHeading: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  wordsText: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a8a",
  },
  bankCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 5,
    padding: 8,
  },
  bankHeading: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 2,
  },
  bankItem: {
    fontSize: 7.5,
    color: "#334155",
    lineHeight: 1.35,
  },

  totalsBox: {
    width: "44%",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 8,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  totalsLabel: {
    fontSize: 7.5,
    color: "#64748b",
  },
  totalsValue: {
    fontSize: 7.5,
    color: "#0f172a",
    fontFamily: "Helvetica-Bold",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    marginTop: 3,
    borderTopWidth: 1.5,
    borderTopColor: "#2563eb",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  grandTotalLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
  },
  grandTotalValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingHorizontal: 4,
  },

  // Notes and Signatory
  bottomSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
  },
  notesBox: {
    width: "55%",
  },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  notesContent: {
    fontSize: 7,
    color: "#64748b",
    lineHeight: 1.3,
  },
  termsList: {
    fontSize: 6.8,
    color: "#64748b",
    lineHeight: 1.3,
    marginTop: 3,
  },
  signatoryBox: {
    width: "40%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  signatoryLine: {
    width: "80%",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    marginBottom: 4,
  },
  signatoryTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  signatorySubtitle: {
    fontSize: 6.8,
    color: "#64748b",
  },
  stampBox: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderStyle: "dashed",
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: "#eff6ff",
  },
  stampText: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
  },

  // Export Banner
  exportBanner: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  exportBannerText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#1d4ed8",
    textAlign: "center",
    letterSpacing: 0.3,
  },

  // Jurisdiction & Tax Terms
  taxTermsCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 0.5,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 5,
    marginTop: 4,
  },
  taxTermsTitle: {
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  taxTermsText: {
    fontSize: 6.5,
    color: "#475569",
    lineHeight: 1.25,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 6.5,
    color: "#94a3b8",
  },
});

export class ReactPdfInvoiceRenderer implements PdfRendererPort {
  async renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const isGst = data.billingMode === "gst";
    const isPaid = data.status.toLowerCase() === "paid" || data.isPaid;
    const isOverdue = data.status.toLowerCase() === "overdue";

    // Status badge colors
    const statusBg = isPaid ? "#dcfce7" : isOverdue ? "#fee2e2" : "#dbeafe";
    const statusColor = isPaid ? "#15803d" : isOverdue ? "#b91c1c" : "#1d4ed8";

    const doc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: "A4", style: styles.page },

        // Top blue accent bar
        React.createElement(View, { style: styles.topAccentBar }),

        // Header
        React.createElement(
          View,
          { style: styles.header },
          React.createElement(
            View,
            { style: styles.brandContainer },
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
                React.createElement(Text, { style: styles.brandName }, data.firmTradeName || data.firmName),
                React.createElement(Text, { style: styles.brandSubtitle }, "Cloud & Platform Control Plane"),
              ),
            ),
            React.createElement(Text, { style: styles.firmAddressBlock }, data.firmAddress),
            React.createElement(
              View,
              { style: styles.firmTaxRow },
              data.firmGstin ? React.createElement(Text, null, `GSTIN: ${data.firmGstin}   `) : null,
              data.firmPan ? React.createElement(Text, null, `PAN: ${data.firmPan}`) : null,
            ),
            data.firmEmail || data.firmPhone
              ? React.createElement(
                  Text,
                  { style: [styles.firmAddressBlock, { marginTop: 2 }] },
                  [data.firmEmail, data.firmPhone].filter(Boolean).join("  •  "),
                )
              : null,
          ),

          React.createElement(
            View,
            { style: styles.invoiceBadgeBox },
            React.createElement(Text, { style: styles.invoiceTitle }, data.documentTitle || (isGst ? "TAX INVOICE" : "BILL OF SUPPLY")),
            React.createElement(Text, { style: styles.invoiceNumber }, data.invoiceNumber),
            React.createElement(
              View,
              { style: [styles.statusBadge, { backgroundColor: statusBg }] },
              React.createElement(
                Text,
                { style: [styles.statusBadgeText, { color: statusColor }] },
                data.status.toUpperCase(),
              ),
            ),
            React.createElement(
              View,
              { style: styles.metaGrid },
              React.createElement(
                View,
                { style: styles.metaGridRow },
                React.createElement(Text, { style: styles.metaGridLabel }, "Issue Date:"),
                React.createElement(Text, { style: styles.metaGridValue }, data.issueDateFormatted),
              ),
              React.createElement(
                View,
                { style: styles.metaGridRow },
                React.createElement(Text, { style: styles.metaGridLabel }, "Due Date:"),
                React.createElement(Text, { style: styles.metaGridValue }, data.dueDateFormatted),
              ),
              React.createElement(
                View,
                { style: styles.metaGridRow },
                React.createElement(Text, { style: styles.metaGridLabel }, "Currency:"),
                React.createElement(Text, { style: styles.metaGridValue }, data.currency),
              ),
              data.placeOfSupply
                ? React.createElement(
                    View,
                    { style: styles.metaGridRow },
                    React.createElement(Text, { style: styles.metaGridLabel }, "Place of Supply:"),
                    React.createElement(Text, { style: styles.metaGridValue }, data.placeOfSupply),
                  )
                : null,
            ),
          ),
        ),

        // Statutory Export Declaration Banner (Zero-Rated Supply under Section 16 IGST Act)
        data.exportDeclaration
          ? React.createElement(
              View,
              { style: styles.exportBanner },
              React.createElement(Text, { style: styles.exportBannerText }, data.exportDeclaration),
            )
          : null,

        // Parties Section (Billed By & Billed To)
        React.createElement(
          View,
          { style: styles.partySection },
          React.createElement(
            View,
            { style: styles.partyCard },
            React.createElement(Text, { style: styles.partyHeading }, "Billed By (Service Provider)"),
            React.createElement(Text, { style: styles.partyName }, data.firmName),
            React.createElement(Text, { style: styles.partyText }, data.firmAddress),
            React.createElement(
              View,
              { style: styles.partyTaxRow },
              data.firmGstin ? React.createElement(Text, { style: styles.partyTaxItem }, `GSTIN: ${data.firmGstin}`) : null,
              data.firmPan ? React.createElement(Text, { style: styles.partyTaxItem }, `PAN: ${data.firmPan}`) : null,
            ),
          ),
          React.createElement(
            View,
            { style: styles.partyCard },
            React.createElement(Text, { style: styles.partyHeading }, "Billed To (Client / Customer)"),
            React.createElement(Text, { style: styles.partyName }, data.clientName),
            React.createElement(Text, { style: styles.partyText }, data.clientAddress || "Address not provided"),
            React.createElement(
              View,
              { style: styles.partyTaxRow },
              data.clientGstin ? React.createElement(Text, { style: styles.partyTaxItem }, `GSTIN: ${data.clientGstin}`) : null,
              data.clientPan ? React.createElement(Text, { style: styles.partyTaxItem }, `PAN: ${data.clientPan}`) : null,
            ),
          ),
        ),

        // Itemized Table
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.thText, styles.colNo] }, "#"),
            React.createElement(Text, { style: [styles.thText, styles.colDesc] }, "Description"),
            React.createElement(Text, { style: [styles.thText, styles.colSac] }, "SAC / HSN"),
            React.createElement(Text, { style: [styles.thText, styles.colQty] }, "Qty"),
            React.createElement(Text, { style: [styles.thText, styles.colRate] }, "Unit Rate"),
            React.createElement(Text, { style: [styles.thText, styles.colAmt] }, "Amount"),
          ),
          data.items.map((it, idx) =>
            React.createElement(
              View,
              {
                key: idx,
                style: idx % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow,
              },
              React.createElement(Text, { style: [styles.cellText, styles.colNo] }, String(idx + 1)),
              React.createElement(Text, { style: [styles.cellTextBold, styles.colDesc] }, it.description),
              React.createElement(Text, { style: [styles.cellText, styles.colSac] }, it.sacCode || "998311"),
              React.createElement(Text, { style: [styles.cellText, styles.colQty] }, String(it.quantity)),
              React.createElement(Text, { style: [styles.cellText, styles.colRate] }, it.unitPriceFormatted),
              React.createElement(Text, { style: [styles.cellTextBold, styles.colAmt] }, it.amountFormatted),
            ),
          ),
        ),

        // Summary, Amount in Words & Bank Details
        React.createElement(
          View,
          { style: styles.summaryContainer },
          React.createElement(
            View,
            { style: styles.wordsAndBankBox },
            data.amountInWords
              ? React.createElement(
                  View,
                  { style: styles.wordsCard },
                  React.createElement(Text, { style: styles.wordsHeading }, "Total Amount in Words"),
                  React.createElement(Text, { style: styles.wordsText }, data.amountInWords),
                )
              : null,

            React.createElement(
              View,
              { style: styles.bankCard },
              React.createElement(Text, { style: styles.bankHeading }, "Bank Transfer & Remittance Details"),
              data.firmBankName ? React.createElement(Text, { style: styles.bankItem }, `Bank Name: ${data.firmBankName}`) : null,
              data.firmAccountNumber ? React.createElement(Text, { style: styles.bankItem }, `Account No: ${data.firmAccountNumber}`) : null,
              data.firmIfsc ? React.createElement(Text, { style: styles.bankItem }, `IFSC Code: ${data.firmIfsc}`) : null,
              data.firmBranch ? React.createElement(Text, { style: styles.bankItem }, `Branch: ${data.firmBranch}`) : null,
              data.firmSwiftBic ? React.createElement(Text, { style: styles.bankItem }, `SWIFT / BIC: ${data.firmSwiftBic}`) : null,
              data.firmIban ? React.createElement(Text, { style: styles.bankItem }, `IBAN: ${data.firmIban}`) : null,
              data.firmLutNumber ? React.createElement(Text, { style: styles.bankItem }, `LUT ARN: ${data.firmLutNumber}`) : null,
              data.firmUpiId ? React.createElement(Text, { style: [styles.bankItem, { fontFamily: "Helvetica-Bold", color: "#2563eb" }] }, `UPI ID: ${data.firmUpiId}`) : null,
            ),
          ),

          React.createElement(
            View,
            { style: styles.totalsBox },
            React.createElement(
              View,
              { style: styles.totalsRow },
              React.createElement(Text, { style: styles.totalsLabel }, "Taxable Subtotal:"),
              React.createElement(Text, { style: styles.totalsValue }, data.subtotalFormatted),
            ),
            data.cgstFormatted
              ? React.createElement(
                  View,
                  { style: styles.totalsRow },
                  React.createElement(Text, { style: styles.totalsLabel }, `CGST (${data.cgstRateFormatted || "9%"}):`),
                  React.createElement(Text, { style: styles.totalsValue }, data.cgstFormatted),
                )
              : null,
            data.sgstFormatted
              ? React.createElement(
                  View,
                  { style: styles.totalsRow },
                  React.createElement(Text, { style: styles.totalsLabel }, `SGST (${data.sgstRateFormatted || "9%"}):`),
                  React.createElement(Text, { style: styles.totalsValue }, data.sgstFormatted),
                )
              : null,
            data.igstFormatted
              ? React.createElement(
                  View,
                  { style: styles.totalsRow },
                  React.createElement(Text, { style: styles.totalsLabel }, `IGST (${data.igstRateFormatted || "18%"}):`),
                  React.createElement(Text, { style: styles.totalsValue }, data.igstFormatted),
                )
              : null,
            React.createElement(
              View,
              { style: styles.grandTotalRow },
              React.createElement(Text, { style: styles.grandTotalLabel }, "Total Amount:"),
              React.createElement(Text, { style: styles.grandTotalValue }, data.totalFormatted),
            ),
            React.createElement(
              View,
              { style: styles.balanceRow },
              React.createElement(Text, { style: [styles.totalsLabel, { fontFamily: "Helvetica-Bold" }] }, "Balance Due:"),
              React.createElement(Text, { style: [styles.totalsValue, { color: isPaid ? "#16a34a" : "#dc2626" }] }, data.balanceFormatted),
            ),
          ),
        ),

        // Bottom Section: Notes & Authorized Signatory
        React.createElement(
          View,
          { style: styles.bottomSection },
          React.createElement(
            View,
            { style: styles.notesBox },
            React.createElement(Text, { style: styles.sectionTitle }, "Terms & Conditions"),
            React.createElement(
              Text,
              { style: styles.termsList },
              "1. Payment is strictly due by the due date mentioned above.\n2. Overdue invoices are subject to automated platform access gating.\n3. All remitted funds should reference the Invoice Number.",
            ),
            data.jurisdictionTaxTerms
              ? React.createElement(
                  View,
                  { style: styles.taxTermsCard },
                  React.createElement(
                    Text,
                    { style: styles.taxTermsTitle },
                    `Statutory & Tax Terms (${data.jurisdictionTaxTerms.destinationCountry})`,
                  ),
                  React.createElement(
                    Text,
                    { style: styles.taxTermsText },
                    data.jurisdictionTaxTerms.reverseChargeClause,
                  ),
                  data.jurisdictionTaxTerms.withholdingTaxNote
                    ? React.createElement(
                        Text,
                        { style: [styles.taxTermsText, { marginTop: 2, fontFamily: "Helvetica-Bold" }] },
                        data.jurisdictionTaxTerms.withholdingTaxNote,
                      )
                    : null,
                )
              : null,
            data.notes
              ? React.createElement(
                  View,
                  { style: { marginTop: 4 } },
                  React.createElement(Text, { style: styles.sectionTitle }, "Invoice Notes"),
                  React.createElement(Text, { style: styles.notesContent }, data.notes),
                )
              : null,
          ),
          React.createElement(
            View,
            { style: styles.signatoryBox },
            React.createElement(View, { style: styles.signatoryLine }),
            React.createElement(Text, { style: styles.signatoryTitle }, `For ${data.firmName}`),
            React.createElement(Text, { style: styles.signatorySubtitle }, "Authorized Signatory"),
            React.createElement(
              View,
              { style: styles.stampBox },
              React.createElement(Text, { style: styles.stampText }, "Digitally Verified • RapidShift Control Plane"),
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
            `This is a digitally generated invoice from ${data.firmName}. Registered Office: ${data.firmAddress}.`,
          ),
          React.createElement(
            Text,
            { style: styles.footerText },
            `Page 1 of 1`,
          ),
        ),
      ),
    );

    return renderToBuffer(doc);
  }
}
