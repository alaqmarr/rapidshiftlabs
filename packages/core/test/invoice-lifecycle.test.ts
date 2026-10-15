import { describe, it, expect } from "vitest";
import { Invoice } from "../src/modules/billing/domain/entities/invoice.entity";
import { InvoiceLine } from "../src/modules/billing/domain/entities/invoice-line.entity";
import { Payment } from "../src/modules/billing/domain/entities/payment.entity";

describe("Invoice Aggregate Lifecycle & Immutability Unit Tests", () => {
  const clientId = "cli_lifecycle_01";
  const now = Date.now();
  const dueDate = now + 15 * 86_400_000;

  it("creates an invoice in draft status and permits line item additions", () => {
    const invoice = Invoice.create({
      clientId,
      dueDate,
      billingMode: "non_gst",
    });

    expect(invoice.status).toBe("draft");
    expect(invoice.subtotalMinor).toBe(0);

    const line = InvoiceLine.create(
      {
        description: "Cloud Hosting & DevOps Maintenance",
        sacCode: "998311",
        quantity: 1,
        unitPriceMinor: 500000, // ₹5,000.00
      },
      invoice.id,
    );

    invoice.addLine(line);

    expect(invoice.lines).toHaveLength(1);
    expect(invoice.subtotalMinor).toBe(500000);
    expect(invoice.totalMinor).toBe(500000);
    expect(invoice.balanceMinor).toBe(500000);
  });

  it("transitions from draft to issued and enforces immutability guards", () => {
    const invoice = Invoice.create({
      clientId,
      dueDate,
      billingMode: "non_gst",
      lines: [
        {
          description: "Monthly Retainer",
          quantity: 1,
          unitPriceMinor: 200000,
        },
      ],
    });

    invoice.issue("RSL/NON-GST/2026-27/0001");
    expect(invoice.status).toBe("issued");
    expect(invoice.invoiceNumber).toBe("RSL/NON-GST/2026-27/0001");

    // Events raised
    const events = invoice.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("invoice.issued");

    // Attempting to modify issued invoice must throw DomainRuleError
    expect(() => {
      invoice.addLine(
        InvoiceLine.create(
          { description: "Extra Service", unitPriceMinor: 50000 },
          invoice.id,
        ),
      );
    }).toThrow("Issued invoices cannot be modified");

    expect(() => {
      invoice.setTaxCalculations({
        cgstRateBps: 900,
        cgstMinor: 18000,
        sgstRateBps: 900,
        sgstMinor: 18000,
        igstRateBps: 0,
        igstMinor: 0,
      });
    }).toThrow("Issued invoices cannot be modified");
  });

  it("handles partial payments and settles full balance", () => {
    const invoice = Invoice.create({
      clientId,
      dueDate,
      billingMode: "non_gst",
      lines: [{ description: "AMC Package", unitPriceMinor: 100000 }],
    });
    invoice.issue("RSL/2026-27/0042");
    invoice.pullEvents(); // clear issue event

    // 1. Partial payment of ₹400.00 (40000 paise out of 100000 paise)
    const partialPayment = Payment.create({
      invoiceId: invoice.id,
      clientId,
      amountMinor: 40000,
      method: "upi",
      reference: "UPI/REF/001",
    });

    invoice.recordPayment(partialPayment);

    expect(invoice.status).toBe("partially_paid");
    expect(invoice.paidMinor).toBe(40000);
    expect(invoice.balanceMinor).toBe(60000);

    const pEvents = invoice.pullEvents();
    expect(pEvents).toHaveLength(1);
    expect(pEvents[0]!.type).toBe("payment.recorded");

    // 2. Overpayment attempt (₹700.00 when balance is ₹600.00)
    const excessPayment = Payment.create({
      invoiceId: invoice.id,
      clientId,
      amountMinor: 70000,
      method: "bank_transfer",
    });

    expect(() => {
      invoice.recordPayment(excessPayment);
    }).toThrow("Payment amount (₹700) exceeds outstanding balance (₹600)");

    // 3. Settling exact remaining balance of ₹600.00 (60000 paise)
    const settlingPayment = Payment.create({
      invoiceId: invoice.id,
      clientId,
      amountMinor: 60000,
      method: "bank_transfer",
      reference: "NEFT/REF/002",
    });

    invoice.recordPayment(settlingPayment);

    expect(invoice.status).toBe("paid");
    expect(invoice.paidMinor).toBe(100000);
    expect(invoice.balanceMinor).toBe(0);

    const finalEvents = invoice.pullEvents();
    // Emits invoice.paid and payment.recorded
    expect(finalEvents.some((e) => e.type === "invoice.paid")).toBe(true);
    expect(finalEvents.some((e) => e.type === "payment.recorded")).toBe(true);
  });

  it("transitions to overdue when clock advances past due date", () => {
    const pastDueDate = now - 86_400_000; // yesterday
    const invoice = Invoice.create({
      clientId,
      dueDate: pastDueDate,
      billingMode: "non_gst",
      lines: [{ description: "Service", unitPriceMinor: 50000 }],
    });
    invoice.issue("RSL/2026-27/0099");
    invoice.pullEvents();

    expect(invoice.status).toBe("issued");

    invoice.markOverdue(now);

    expect(invoice.status).toBe("overdue");
    const events = invoice.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("invoice.overdue");
  });

  it("handles voiding and rejects payments on voided invoices", () => {
    const invoice = Invoice.create({
      clientId,
      dueDate,
      billingMode: "non_gst",
      lines: [{ description: "Erroneous Item", unitPriceMinor: 50000 }],
    });
    invoice.issue("RSL/2026-27/0100");

    invoice.voidInvoice("Billed in error");
    expect(invoice.status).toBe("void");

    const payment = Payment.create({
      invoiceId: invoice.id,
      clientId,
      amountMinor: 50000,
    });

    expect(() => {
      invoice.recordPayment(payment);
    }).toThrow("Cannot record payment for voided invoice");
  });
});
