export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { requireAdminRole } from "@/lib/admin-server-guard";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminRole(request, { blockedRoles: ["ops", "support"] });
    if (guard.errorResponse) return guard.errorResponse;

    const { id } = await context.params;
    const container = getContainer();

    const invoice = await container.billingModule.issueInvoiceUseCase.execute(id);
    return NextResponse.json({ invoice: invoice.toJSON(), issued: true });
  } catch (error) {
    console.error("[API] Error issuing invoice:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
