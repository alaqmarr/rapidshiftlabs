import { getContainer } from "@rsl/core/container";
import {
  InvoiceManager,
  type InvoiceItem,
  type SummaryData,
  type ClientOption,
} from "@/features/billing/invoice-manager";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage() {
  const container = getContainer();

  let initialInvoices: InvoiceItem[] = [];
  let summary: SummaryData = {
    totalBilledMinor: 0,
    totalPaidMinor: 0,
    outstandingMinor: 0,
    overdueCount: 0,
    activeInvoicesCount: 0,
  };
  let clients: ClientOption[] = [];

  try {
    const [invoicesRes, billingSummary, clientsRes] = await Promise.all([
      container.billingRepo.listInvoices({ limit: 100 }),
      container.billingRepo.getBillingSummary(),
      container.clientsModule.listClientsUseCase.execute({ limit: 100 }),
    ]);

    summary = billingSummary;
    clients = clientsRes.items.map((c) => ({
      id: c.id,
      name: c.name,
      currency: c.currency,
      country: c.country,
      state: c.state || undefined,
    }));

    initialInvoices = await Promise.all(
      invoicesRes.items.map(async (inv) => {
        const client = await container.clientDirectoryRepo.findById(inv.clientId);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          billingMode: inv.billingMode,
          clientId: inv.clientId,
          clientName: client?.name || inv.clientId,
          status: inv.status,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          subtotalMinor: inv.subtotalMinor,
          cgstMinor: inv.cgstMinor,
          sgstMinor: inv.sgstMinor,
          igstMinor: inv.igstMinor,
          cgstRateBps: inv.cgstRateBps,
          sgstRateBps: inv.sgstRateBps,
          igstRateBps: inv.igstRateBps,
          totalMinor: inv.totalMinor,
          paidMinor: inv.paidMinor,
          balanceMinor: inv.balanceMinor,
          currency: inv.currency,
          createdAt: inv.createdAt,
          lines: inv.lines.map((l) => ({
            id: l.id,
            description: l.description,
            sacCode: l.sacCode,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            amountMinor: l.amountMinor,
          })),
        };
      }),
    );
  } catch (err) {
    console.error("[AdminInvoicesPage] Server fetch error:", err);
  }

  return (
    <InvoiceManager
      initialInvoices={initialInvoices}
      initialSummary={summary}
      clients={clients}
    />
  );
}
