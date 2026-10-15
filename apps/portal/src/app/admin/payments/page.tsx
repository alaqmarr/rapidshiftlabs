import { getContainer } from "@rsl/core/container";
import {
  PaymentManager,
  type PaymentItem,
  type InvoiceOption,
} from "@/features/billing/payment-manager";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const container = getContainer();

  let initialPayments: PaymentItem[] = [];
  let eligibleInvoices: InvoiceOption[] = [];

  try {
    const [paymentsRes, invoicesRes] = await Promise.all([
      container.billingRepo.listPayments({ limit: 100 }),
      container.billingRepo.listInvoices({ limit: 100 }),
    ]);

    initialPayments = await Promise.all(
      paymentsRes.items.map(async (p) => {
        const [invoice, client] = await Promise.all([
          container.billingRepo.findInvoiceById(p.invoiceId),
          container.clientDirectoryRepo.findById(p.clientId),
        ]);
        return {
          id: p.id,
          invoiceId: p.invoiceId,
          invoiceNumber: invoice?.invoiceNumber || p.invoiceId,
          clientId: p.clientId,
          clientName: client?.name || p.clientId,
          amountMinor: p.amountMinor,
          method: p.method,
          paymentDate: p.paymentDate,
          reference: p.reference || undefined,
          notes: p.notes || undefined,
          recordedBy: p.recordedBy || undefined,
          createdAt: p.createdAt,
        };
      }),
    );

    eligibleInvoices = await Promise.all(
      invoicesRes.items
        .filter(
          (i) =>
            i.status === "issued" ||
            i.status === "partially_paid" ||
            i.status === "overdue",
        )
        .map(async (i) => {
          const client = await container.clientDirectoryRepo.findById(i.clientId);
          return {
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            clientName: client?.name || i.clientId,
            balanceMinor: i.balanceMinor,
            totalMinor: i.totalMinor,
            status: i.status,
          };
        }),
    );
  } catch (err) {
    console.error("[AdminPaymentsPage] Server fetch error:", err);
  }

  return (
    <PaymentManager
      initialPayments={initialPayments}
      invoices={eligibleInvoices}
    />
  );
}
