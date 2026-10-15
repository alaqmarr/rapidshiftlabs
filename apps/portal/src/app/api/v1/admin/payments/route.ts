export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { clearGateCache } from "@/lib/cache/lru-cache";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get("clientId") || undefined;
    const invoiceId = searchParams.get("invoiceId") || undefined;

    const container = getContainer();
    const paymentsRes = await container.billingRepo.listPayments({
      clientId,
      invoiceId,
      limit: 100,
    });

    const items = await Promise.all(
      paymentsRes.items.map(async (p) => {
        const [invoice, client] = await Promise.all([
          container.billingRepo.findInvoiceById(p.invoiceId),
          container.clientDirectoryRepo.findById(p.clientId),
        ]);
        return {
          ...p.toJSON(),
          invoiceNumber: invoice?.invoiceNumber || p.invoiceId,
          clientName: client?.name || p.clientId,
        };
      }),
    );

    return NextResponse.json({ items, total: paymentsRes.total });
  } catch (error) {
    console.error("[API] Error listing payments:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const container = getContainer();

    const { payment, invoice } = await container.billingModule.recordPaymentUseCase.execute({
      invoiceId: body.invoiceId,
      amountMinor: Number(body.amountMinor),
      method: body.method || "upi",
      reference: body.reference,
      notes: body.notes,
      paymentDate: body.paymentDate ? new Date(body.paymentDate).getTime() : undefined,
      recordedBy: body.recordedBy || "admin",
    });

    // Trigger entitlement re-evaluation & invalidate gate LRU cache (<5s recovery)
    try {
      await container.entitlementModule.handleBillingEvent("InvoicePaid", {
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        balancePaise: invoice.balanceMinor,
      });
      clearGateCache();
    } catch (entErr) {
      console.warn("[API Payments] Entitlement event handling warning:", entErr);
    }

    return NextResponse.json(
      {
        payment: payment.toJSON(),
        invoice: invoice.toJSON(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API] Error recording payment:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
