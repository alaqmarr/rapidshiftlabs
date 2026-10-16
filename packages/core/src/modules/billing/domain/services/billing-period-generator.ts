import {
  toDateKey,
  fromDateKey,
  addMonthsToDateKey,
  addDaysToDateKey,
  diffDays,
  compareDateKeys,
  DAY,
} from "../../../../shared/kernel/time";
import { newId, ID_PREFIX } from "../../../../shared/kernel/id";

export interface GenerateBillingPeriodsInput {
  contractId: string;
  clientId: string;
  amountMinor: number;
  currency: string;
  billingCycle:
    | "monthly"
    | "quarterly"
    | "half_yearly"
    | "yearly"
    | "every_n_days"
    | "one_time"
    | "milestone";
  intervalCount?: number;
  anchorDay?: number;
  validFrom: number; // epoch ms
  validTo: number; // epoch ms
  paymentTermsDays?: number;
}

export interface GeneratedBillingPeriod {
  id: string;
  contractId: string;
  clientId: string;
  periodNumber: number;
  periodStart: number; // epoch ms
  periodEnd: number; // epoch ms
  dueDate: number; // epoch ms
  amountMinor: number;
  currency: string;
  status: "pending";
}

export class BillingPeriodGenerator {
  static generate(input: GenerateBillingPeriodsInput): GeneratedBillingPeriod[] {
    const {
      contractId,
      clientId,
      amountMinor,
      currency,
      billingCycle,
      intervalCount = 1,
      anchorDay = 1,
      validFrom,
      validTo,
      paymentTermsDays = 15,
    } = input;

    // 1. One-time or Milestone
    if (billingCycle === "one_time" || billingCycle === "milestone") {
      if (validTo < validFrom) {
        return [];
      }
      const dueDate = validFrom + paymentTermsDays * DAY;
      return [
        {
          id: newId(ID_PREFIX.billingPeriod),
          contractId,
          clientId,
          periodNumber: 1,
          periodStart: validFrom,
          periodEnd: Math.max(validTo, validFrom),
          dueDate,
          amountMinor,
          currency,
          status: "pending",
        },
      ];
    }

    if (validTo <= validFrom) {
      return [];
    }

    const validFromKey = toDateKey(validFrom);
    const validToKey = toDateKey(validTo);

    // 2. Every N Days
    if (billingCycle === "every_n_days") {
      const stepDays = Math.max(1, intervalCount);
      const periods: GeneratedBillingPeriod[] = [];
      let currentStartKey = validFromKey;
      let periodNum = 1;

      while (compareDateKeys(currentStartKey, validToKey) <= 0) {
        const nextStartKey = addDaysToDateKey(currentStartKey, stepDays);
        let periodEndKey = addDaysToDateKey(nextStartKey, -1);

        let isPartial = false;
        if (compareDateKeys(periodEndKey, validToKey) > 0) {
          periodEndKey = validToKey;
          isPartial = true;
        }

        const actualDays = diffDays(currentStartKey, periodEndKey) + 1;
        const periodAmount = isPartial
          ? Math.round((amountMinor * actualDays) / stepDays)
          : amountMinor;

        const periodStartEpoch = fromDateKey(currentStartKey);
        const periodEndEpoch = fromDateKey(periodEndKey) + DAY - 1;
        const dueDate = periodStartEpoch + paymentTermsDays * DAY;

        periods.push({
          id: newId(ID_PREFIX.billingPeriod),
          contractId,
          clientId,
          periodNumber: periodNum++,
          periodStart: periodStartEpoch,
          periodEnd: periodEndEpoch,
          dueDate,
          amountMinor: periodAmount,
          currency,
          status: "pending",
        });

        currentStartKey = nextStartKey;
      }
      return periods;
    }

    // 3. Calendar cycles: monthly, quarterly, half_yearly, yearly
    let cycleMonths = 1;
    if (billingCycle === "monthly") cycleMonths = 1 * intervalCount;
    else if (billingCycle === "quarterly") cycleMonths = 3 * intervalCount;
    else if (billingCycle === "half_yearly") cycleMonths = 6 * intervalCount;
    else if (billingCycle === "yearly") cycleMonths = 12 * intervalCount;

    const periods: GeneratedBillingPeriod[] = [];
    let periodNum = 1;

    let currentStartKey = validFromKey;
    const [startYear, startMonth, startDay] = validFromKey.split("-").map(Number) as [number, number, number];

    // Determine baseline anchor date key
    let anchorCursorKey: string;
    if (startDay <= anchorDay) {
      // Nominal start in current month
      const daysInStartMonth = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();
      const actualAnchorInStart = Math.min(anchorDay, daysInStartMonth);
      anchorCursorKey = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(actualAnchorInStart).padStart(2, "0")}`;
    } else {
      // Passed anchor day in this month, so next anchor date is in next cycle
      const daysInStartMonth = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();
      const actualAnchorInStart = Math.min(anchorDay, daysInStartMonth);
      const startNominal = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(actualAnchorInStart).padStart(2, "0")}`;
      anchorCursorKey = addMonthsToDateKey(startNominal, cycleMonths, anchorDay);
    }

    while (compareDateKeys(currentStartKey, validToKey) <= 0) {
      let nextAnchorKey: string;
      let nominalStartKey: string;

      if (compareDateKeys(currentStartKey, anchorCursorKey) === 0) {
        nextAnchorKey = addMonthsToDateKey(anchorCursorKey, cycleMonths, anchorDay);
        nominalStartKey = anchorCursorKey;
      } else if (compareDateKeys(currentStartKey, anchorCursorKey) < 0) {
        // Partial first period before the anchorCursor
        nextAnchorKey = anchorCursorKey;
        nominalStartKey = addMonthsToDateKey(anchorCursorKey, -cycleMonths, anchorDay);
      } else {
        // Advanced beyond current anchorCursor
        nextAnchorKey = addMonthsToDateKey(anchorCursorKey, cycleMonths, anchorDay);
        nominalStartKey = anchorCursorKey;
      }

      let periodEndKey = addDaysToDateKey(nextAnchorKey, -1);
      let isPartial = false;

      const fullCycleDays = Math.max(1, diffDays(nominalStartKey, periodEndKey) + 1);

      if (compareDateKeys(currentStartKey, nominalStartKey) > 0) {
        isPartial = true;
      }

      if (compareDateKeys(periodEndKey, validToKey) > 0) {
        periodEndKey = validToKey;
        isPartial = true;
      }

      const actualDays = Math.max(1, diffDays(currentStartKey, periodEndKey) + 1);
      const periodAmount = isPartial
        ? Math.round((amountMinor * actualDays) / fullCycleDays)
        : amountMinor;

      const periodStartEpoch = fromDateKey(currentStartKey);
      const periodEndEpoch = fromDateKey(periodEndKey) + DAY - 1;
      const dueDate = periodStartEpoch + paymentTermsDays * DAY;

      periods.push({
        id: newId(ID_PREFIX.billingPeriod),
        contractId,
        clientId,
        periodNumber: periodNum++,
        periodStart: periodStartEpoch,
        periodEnd: periodEndEpoch,
        dueDate,
        amountMinor: periodAmount,
        currency,
        status: "pending",
      });

      currentStartKey = nextAnchorKey;
      anchorCursorKey = nextAnchorKey;
    }

    return periods;
  }
}
