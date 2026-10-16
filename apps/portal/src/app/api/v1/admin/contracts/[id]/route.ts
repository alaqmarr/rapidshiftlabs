export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const container = getContainer();

    const contract = await container.contractRepo.findById(id);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const isOneTime =
      body.isOneTime !== undefined
        ? Boolean(body.isOneTime)
        : body.billingCycle === "one_time" || body.billingCycle === "milestone";

    const nextCycle = isOneTime
      ? "one_time"
      : body.billingCycle === "annual"
        ? "yearly"
        : body.billingCycle || contract.billingCycle;

    const validFromMs =
      body.validFrom !== undefined ? new Date(body.validFrom).getTime() : contract.validFrom;
    const rawValidToMs =
      body.validTo !== undefined ? new Date(body.validTo).getTime() : contract.validTo;
    const validToMs =
      isOneTime && (!rawValidToMs || rawValidToMs <= validFromMs)
        ? validFromMs + 86_400_000
        : rawValidToMs;

    contract.updateDetails({
      title: body.title,
      amountMinor: body.amountMinor !== undefined ? Number(body.amountMinor) : undefined,
      currency: body.currency,
      billingCycle: nextCycle as any,
      intervalCount: body.intervalCount !== undefined ? Number(body.intervalCount) : undefined,
      anchorDay: body.anchorDay !== undefined ? Number(body.anchorDay) : undefined,
      validFrom: validFromMs,
      validTo: validToMs,
      autoRenew: body.autoRenew !== undefined ? Boolean(body.autoRenew) : undefined,
      taxProfile: body.taxProfile,
      status: body.status,
      notes: body.notes,
    });

    await container.contractRepo.update(contract);

    return NextResponse.json({ contract: contract.toJSON(), updated: true });
  } catch (error) {
    console.error("[API] Error updating contract:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
