export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get("clientId") || undefined;
    const status = searchParams.get("status") || undefined;

    const container = getContainer();
    const result = await container.contractsModule.listContractsUseCase.execute({
      clientId,
      status,
      limit: 100,
    });

    // Populate client names for presentation
    const items = await Promise.all(
      result.items.map(async (c) => {
        const client = await container.clientDirectoryRepo.findById(c.clientId);
        return {
          ...c.toJSON(),
          clientName: client?.name || c.clientId,
        };
      }),
    );

    return NextResponse.json({ items, total: result.total });
  } catch (error) {
    console.error("[API] Error listing contracts:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const container = getContainer();

    const contract = await container.contractsModule.createContractUseCase.execute({
      clientId: body.clientId,
      code: body.code,
      title: body.title,
      amountMinor: Number(body.amountMinor || 0),
      currency: body.currency || "INR",
      billingCycle: body.billingCycle || "monthly",
      intervalCount: Number(body.intervalCount || 1),
      anchorDay: Number(body.anchorDay || 1),
      validFrom: new Date(body.validFrom).getTime(),
      validTo: new Date(body.validTo).getTime(),
      autoRenew: Boolean(body.autoRenew),
      taxProfile: body.taxProfile || "non_gst",
      notes: body.notes,
      items: body.items,
    });

    return NextResponse.json({ contract: contract.toJSON() }, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating contract:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
