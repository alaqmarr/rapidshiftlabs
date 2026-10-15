export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get("clientId") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;

    const container = getContainer();

    const [invoicesRes, summary] = await Promise.all([
      container.billingRepo.listInvoices({
        clientId,
        status,
        search,
        limit: 100,
      }),
      container.billingRepo.getBillingSummary(clientId),
    ]);

    // Attach client names
    const items = await Promise.all(
      invoicesRes.items.map(async (inv) => {
        const client = await container.clientDirectoryRepo.findById(inv.clientId);
        return {
          ...inv.toJSON(),
          clientName: client?.name || inv.clientId,
        };
      }),
    );

    return NextResponse.json({
      items,
      total: invoicesRes.total,
      summary,
    });
  } catch (error) {
    console.error("[API] Error listing invoices:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const container = getContainer();

    const invoice = await container.billingModule.createManualInvoiceUseCase.execute({
      clientId: body.clientId,
      contractId: body.contractId,
      billingMode: body.billingMode,
      dueDate: new Date(body.dueDate).getTime(),
      currency: body.currency || "INR",
      notes: body.notes,
      lines: body.lines || [],
    });

    if (body.issueImmediately) {
      const issued = await container.billingModule.issueInvoiceUseCase.execute(invoice.id);
      return NextResponse.json({ invoice: issued.toJSON() }, { status: 201 });
    }

    return NextResponse.json({ invoice: invoice.toJSON() }, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating invoice:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
