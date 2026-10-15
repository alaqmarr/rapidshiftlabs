export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    const invoice = await container.billingModule.issueInvoiceUseCase.execute(id);
    return NextResponse.json({ invoice: invoice.toJSON(), issued: true });
  } catch (error) {
    console.error("[API] Error issuing invoice:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
