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

    const contract = await container.contractsModule.activateContractUseCase.execute(id);

    // Generate schedule
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

    return NextResponse.json({ contract: contract.toJSON(), activated: true });
  } catch (error) {
    console.error("[API] Error activating contract:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
