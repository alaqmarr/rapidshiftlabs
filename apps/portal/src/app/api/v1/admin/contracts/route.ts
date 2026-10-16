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

    const isOneTime =
      Boolean(body.isOneTime) ||
      body.billingCycle === "one_time" ||
      body.billingCycle === "milestone";
    const billingCycle = isOneTime
      ? "one_time"
      : body.billingCycle === "annual"
        ? "yearly"
        : body.billingCycle || "monthly";

    const validFromMs = body.validFrom ? new Date(body.validFrom).getTime() : Date.now();
    const rawValidToMs = body.validTo ? new Date(body.validTo).getTime() : validFromMs + 86_400_000;
    const validToMs =
      isOneTime && (!rawValidToMs || rawValidToMs <= validFromMs)
        ? validFromMs + 86_400_000
        : rawValidToMs;

    let contract = await container.contractsModule.createContractUseCase.execute({
      clientId: body.clientId,
      code: body.code,
      title: body.title || (isOneTime ? "One-Time Engagement" : "Master Service Agreement"),
      amountMinor: Number(body.amountMinor || 0),
      currency: body.currency || "INR",
      billingCycle,
      intervalCount: Number(body.intervalCount || 1),
      anchorDay: Number(body.anchorDay || new Date(validFromMs).getDate() || 1),
      validFrom: validFromMs,
      validTo: validToMs,
      autoRenew: isOneTime ? false : Boolean(body.autoRenew),
      taxProfile: body.taxProfile || "non_gst",
      notes: body.notes,
      items: body.items,
    });

    if (body.activateImmediately) {
      try {
        contract = await container.contractsModule.activateContractUseCase.execute(contract.id);
        await container.billingModule.generateScheduleUseCase.execute({
          contractId: contract.id,
          clientId: contract.clientId,
          amountMinor: contract.amountMinor,
          currency: contract.currency,
          billingCycle: contract.billingCycle,
          intervalCount: contract.intervalCount,
          anchorDay: contract.anchorDay,
          validFrom: contract.validFrom,
          validTo: contract.validTo,
          paymentTermsDays: contract.paymentTermsDays,
        });
      } catch (actErr) {
        console.warn("[API] Auto-activation warning:", actErr);
      }
    }

    return NextResponse.json({ contract: contract.toJSON() }, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating contract:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
