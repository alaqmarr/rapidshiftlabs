import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import {
  PortalBillingView,
  type ClientData,
  type InvoiceItem,
  type PaymentItem,
  type BillingSummary,
} from "@/features/billing/portal-billing-view";

export const dynamic = "force-dynamic";

export default async function ClientPortalBillingPage() {
  const session = await auth();
  const container = getContainer();

  let clientId = session?.user?.clientId;

  if (!clientId) {
    try {
      const allClients = await container.clientDirectoryRepo.list({ limit: 1 });
      clientId = allClients.items[0]?.id || "cli_preview_01";
    } catch {
      clientId = "cli_preview_01";
    }
  }

  let clientData: ClientData | null = null;
  let invoices: InvoiceItem[] = [];
  let payments: PaymentItem[] = [];
  let summary: BillingSummary = {
    totalBilledMinor: 0,
    totalPaidMinor: 0,
    outstandingMinor: 0,
    overdueCount: 0,
    activeInvoicesCount: 0,
  };
  let nextDueInvoice: InvoiceItem | null = null;

  try {
    const [client, invoicesRes, paymentsRes, billingSummary] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId),
      container.billingRepo.listInvoices({ clientId, limit: 50 }),
      container.billingRepo.listPayments({ clientId, limit: 50 }),
      container.billingRepo.getBillingSummary(clientId),
    ]);

    if (client) {
      clientData = {
        id: client.id,
        name: client.name,
        currency: client.currency,
      };
    }

    summary = billingSummary;

    invoices = invoicesRes.items.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      billingMode: inv.billingMode,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalMinor: inv.totalMinor,
      paidMinor: inv.paidMinor,
      balanceMinor: inv.balanceMinor,
      currency: inv.currency,
      createdAt: inv.createdAt,
    }));

    payments = paymentsRes.items.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      amountMinor: p.amountMinor,
      method: p.method,
      paymentDate: p.paymentDate,
      reference: p.reference || undefined,
      notes: p.notes || undefined,
    }));

    const unpaid = invoices
      .filter((i) => i.status === "issued" || i.status === "partially_paid" || i.status === "overdue")
      .sort((a, b) => a.dueDate - b.dueDate);

    nextDueInvoice = unpaid[0] || null;
  } catch (err) {
    console.error("[ClientPortalBillingPage] Server fetch error:", err);
  }

  return (
    <PortalBillingView
      client={clientData}
      invoices={invoices}
      payments={payments}
      summary={summary}
      nextDueInvoice={nextDueInvoice}
    />
  );
}
