import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { calculateContractTenure, addTenurePresetToDate, toDateInputValue } from "@/lib/contract-tenure";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor || actor.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = body.action || "roll_forward_renewal";

    const container = getContainer();
    const contract = await container.contractRepo.findById(id);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (action === "roll_forward_renewal") {
      const currentTenure = calculateContractTenure({
        billingCycle: contract.billingCycle,
        intervalCount: contract.intervalCount,
        anchorDay: contract.anchorDay,
        validFrom: contract.validFrom,
        validTo: contract.validTo,
        amountMinor: contract.amountMinor,
        status: contract.status,
      });

      if (currentTenure.isOneTime) {
        return NextResponse.json(
          { error: "One-Time engagement contracts do not have a recurring renewal window." },
          { status: 400 },
        );
      }

      const nowMs = Date.now();
      // Start the new window from the previous validTo (if recent/future) or today if long expired
      const baseStartMs =
        contract.validTo >= nowMs - 30 * 86_400_000 ? contract.validTo : nowMs;

      let newEndDateMs: number;
      if (currentTenure.totalCalendarMonths > 0) {
        const baseDateStr = toDateInputValue(baseStartMs);
        const targetDateStr = addTenurePresetToDate(baseDateStr, currentTenure.totalCalendarMonths);
        newEndDateMs =
          new Date(`${targetDateStr}T23:59:59`).getTime() +
          currentTenure.extraDays * 86_400_000;
      } else {
        const daysToAdd = Math.max(30, currentTenure.totalDays);
        newEndDateMs = baseStartMs + daysToAdd * 86_400_000;
      }

      contract.updateDetails({
        validFrom: baseStartMs,
        validTo: newEndDateMs,
        status: "active",
      });

      await container.contractRepo.update(contract);

      const updatedTenure = calculateContractTenure({
        billingCycle: contract.billingCycle,
        intervalCount: contract.intervalCount,
        anchorDay: contract.anchorDay,
        validFrom: contract.validFrom,
        validTo: contract.validTo,
        amountMinor: contract.amountMinor,
        status: contract.status,
      });

      return NextResponse.json({
        success: true,
        action: "roll_forward_renewal",
        message: `Contract ${contract.code} rolled forward by ${updatedTenure.tenureLabel} (${updatedTenure.dateRangeLabel}).`,
        contract: {
          id: contract.id,
          code: contract.code,
          clientId: contract.clientId,
          status: contract.status,
          billingCycle: contract.billingCycle,
          validFrom: contract.validFrom,
          validTo: contract.validTo,
          amountMinor: contract.amountMinor,
          calculatedTenure: updatedTenure,
        },
      });
    }

    return NextResponse.json({ error: `Unsupported autopilot action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Contract autopilot action failed" },
      { status: 500 },
    );
  }
}
