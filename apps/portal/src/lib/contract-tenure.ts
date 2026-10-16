export interface ContractTenureInput {
  billingCycle?: string | null;
  validFrom?: number | string | Date | null;
  validTo?: number | string | Date | null;
  amountMinor?: number | null;
  currency?: string | null;
  intervalCount?: number | null;
  anchorDay?: number | null;
  status?: string | null;
  nowMs?: number;
}

export interface ContractTenureMetrics {
  isOneTime: boolean;
  billingCycleNormalized:
    | "one_time"
    | "monthly"
    | "quarterly"
    | "half_yearly"
    | "yearly"
    | "every_n_days";
  cycleLabel: string;
  startDateMs: number;
  endDateMs: number;
  totalDays: number;
  calendarYears: number;
  calendarMonths: number;
  totalCalendarMonths: number;
  extraDays: number;
  tenureLabel: string;
  shortTenureLabel: string;
  dateRangeLabel: string;
  elapsedDays: number;
  daysRemaining: number;
  daysOverdueRenewal: number;
  isOverdueRenewal: boolean;
  progressPct: number;
  isUpcoming: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  remainingLabel: string;
  totalCycles: number;
  totalContractValueMinor: number;
  monthlyEquivalentMinor: number;
  annualEquivalentMinor: number;
  nextBillingDateMs: number | null;
  nextBillingDateLabel: string;
}

const DAY_MS = 86_400_000;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toEpochMs(val: number | string | Date | null | undefined, fallback = Date.now()): number {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val.getTime();
  if (typeof val === "string" && val.trim().length > 0) {
    const parsed = new Date(val).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export function formatShortDate(ms: number | string | Date | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(toEpochMs(ms, 0));
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = MONTHS_SHORT[d.getMonth()] || "Jan";
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

export function toDateInputValue(ms: number | string | Date | null | undefined): string {
  const epoch = toEpochMs(ms, Date.now());
  const d = new Date(epoch);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addTenurePresetToDate(startDateStr: string, monthsToAdd: number): string {
  const base = startDateStr ? new Date(`${startDateStr}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date(Date.now() + monthsToAdd * 30 * DAY_MS);
    return toDateInputValue(fallback);
  }
  const target = new Date(base);
  const origDay = target.getDate();
  target.setMonth(target.getMonth() + monthsToAdd);
  if (target.getDate() !== origDay) {
    target.setDate(0);
  }
  return toDateInputValue(target);
}

export function normalizeBillingCycle(
  rawCycle?: string | null,
): ContractTenureMetrics["billingCycleNormalized"] {
  const c = (rawCycle || "monthly").toLowerCase().trim();
  if (c === "one_time" || c === "onetime" || c === "one-time" || c === "milestone") {
    return "one_time";
  }
  if (c === "quarterly" || c === "quarter") return "quarterly";
  if (c === "half_yearly" || c === "half-yearly" || c === "semiannual" || c === "semi_annual") {
    return "half_yearly";
  }
  if (c === "yearly" || c === "annual" || c === "annually") return "yearly";
  if (c === "every_n_days") return "every_n_days";
  return "monthly";
}

export function getBillingCycleLabel(rawCycle?: string | null, intervalCount?: number | null): string {
  const norm = normalizeBillingCycle(rawCycle);
  switch (norm) {
    case "one_time":
      return "One-Time";
    case "quarterly":
      return "Quarterly";
    case "half_yearly":
      return "Half-Yearly";
    case "yearly":
      return "Annual";
    case "every_n_days":
      return intervalCount && intervalCount > 0 ? `Every ${intervalCount} Days` : "Custom Days";
    default:
      return "Monthly";
  }
}

/**
 * Computes exact calendar years, months, and extra days between two timestamps.
 */
function computeCalendarDiff(startMs: number, endMs: number): {
  years: number;
  months: number;
  totalMonths: number;
  extraDays: number;
  totalDays: number;
} {
  if (endMs <= startMs) {
    return { years: 0, months: 0, totalMonths: 0, extraDays: 0, totalDays: 0 };
  }

  const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS));

  const start = new Date(startMs);
  const end = new Date(endMs);

  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let extraDays = end.getUTCDate() - start.getUTCDate();

  if (extraDays < 0) {
    months -= 1;
    const prevMonthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
    extraDays += prevMonthEnd.getUTCDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = Math.max(0, years * 12 + months);

  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    totalMonths,
    extraDays: Math.max(0, extraDays),
    totalDays,
  };
}

/**
 * Computes the next scheduled billing date for a recurring contract.
 */
function computeNextBillingDateMs(params: {
  isOneTime: boolean;
  cycle: ContractTenureMetrics["billingCycleNormalized"];
  startMs: number;
  endMs: number;
  intervalCount: number;
  anchorDay?: number | null;
  status?: string | null;
  nowMs: number;
}): number | null {
  const { isOneTime, cycle, startMs, endMs, intervalCount, anchorDay, status, nowMs } = params;
  if (isOneTime) return null;
  if (status === "terminated" || status === "expired") return null;
  if (endMs < nowMs) return null;

  if (startMs > nowMs) {
    return startMs;
  }

  if (cycle === "every_n_days") {
    const stepMs = Math.max(1, intervalCount) * DAY_MS;
    const elapsed = nowMs - startMs;
    const periodsPassed = Math.floor(elapsed / stepMs) + 1;
    const candidate = startMs + periodsPassed * stepMs;
    return candidate <= endMs + DAY_MS ? candidate : null;
  }

  const cycleMonths =
    cycle === "yearly"
      ? 12 * intervalCount
      : cycle === "half_yearly"
        ? 6 * intervalCount
        : cycle === "quarterly"
          ? 3 * intervalCount
          : 1 * intervalCount;

  const startD = new Date(startMs);
  const anchor = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : startD.getUTCDate();

  let cursor = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1));
  const setClampedDay = (d: Date, day: number) => {
    const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, maxDay));
  };
  setClampedDay(cursor, anchor);

  let guard = 0;
  while (cursor.getTime() <= nowMs && guard < 240) {
    guard++;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + cycleMonths, 1));
    setClampedDay(cursor, anchor);
  }

  const nextMs = cursor.getTime();
  return nextMs <= endMs + DAY_MS ? nextMs : null;
}

/**
 * Universal Contract Tenure & Financial Calculator used across Client Section,
 * Contracts, Billing, Dashboards, and all 23 Embed Widgets.
 */
export function calculateContractTenure(
  input: ContractTenureInput,
  nowOverrideMs?: number,
): ContractTenureMetrics {
  const nowMs = nowOverrideMs ?? input.nowMs ?? Date.now();
  const billingCycleNormalized = normalizeBillingCycle(input.billingCycle);
  const isOneTime = billingCycleNormalized === "one_time";
  const intervalCount = Math.max(1, Number(input.intervalCount || 1));
  const cycleLabel = getBillingCycleLabel(input.billingCycle, intervalCount);
  const amountMinor = Math.max(0, Number(input.amountMinor || 0));
  const status = (input.status || "active").toLowerCase();

  const startDateMs = toEpochMs(input.validFrom, nowMs);
  const rawEndDateMs = toEpochMs(
    input.validTo,
    isOneTime ? startDateMs : startDateMs + 365 * DAY_MS,
  );
  const endDateMs = isOneTime ? startDateMs : Math.max(startDateMs + DAY_MS, rawEndDateMs);

  if (isOneTime) {
    const dateStr = formatShortDate(startDateMs);
    return {
      isOneTime: true,
      billingCycleNormalized: "one_time",
      cycleLabel: "One-Time",
      startDateMs,
      endDateMs: startDateMs,
      totalDays: 1,
      calendarYears: 0,
      calendarMonths: 0,
      totalCalendarMonths: 0,
      extraDays: 1,
      tenureLabel: "One-Time Engagement",
      shortTenureLabel: "One-Time",
      dateRangeLabel: `${dateStr} (One-Time)`,
      elapsedDays: nowMs >= startDateMs ? 1 : 0,
      daysRemaining: 0,
      daysOverdueRenewal: 0,
      isOverdueRenewal: false,
      progressPct: status === "active" || status === "renewed" ? 100 : 0,
      isUpcoming: startDateMs > nowMs,
      isExpired: false,
      isExpiringSoon: false,
      remainingLabel: "Single Settlement • No Expiry",
      totalCycles: 1,
      totalContractValueMinor: amountMinor,
      monthlyEquivalentMinor: 0,
      annualEquivalentMinor: 0,
      nextBillingDateMs: null,
      nextBillingDateLabel: "One-Time (No Recurring Cycle)",
    };
  }

  const diff = computeCalendarDiff(startDateMs, endDateMs);
  const { years, months, totalMonths, extraDays, totalDays } = diff;

  // Build accurate human-readable tenure label from date range
  const parts: string[] = [];
  if (totalMonths > 0) {
    parts.push(`${totalMonths} ${totalMonths === 1 ? "Month" : "Months"}`);
  }
  if (extraDays > 0) {
    parts.push(`${extraDays} ${extraDays === 1 ? "Day" : "Days"}`);
  }
  const baseDuration = parts.length > 0 ? parts.join(", ") : `${totalDays} ${totalDays === 1 ? "Day" : "Days"}`;
  const tenureLabel =
    totalMonths > 0 ? `${baseDuration} (${totalDays} Days)` : `${totalDays} ${totalDays === 1 ? "Day" : "Days"}`;

  const shortParts: string[] = [];
  if (totalMonths > 0) shortParts.push(`${totalMonths}m`);
  if (extraDays > 0) shortParts.push(`${extraDays}d`);
  const shortTenureLabel =
    shortParts.length > 0 ? `${shortParts.join(" ")} (${totalDays}d)` : `${totalDays}d`;

  const dateRangeLabel = `${formatShortDate(startDateMs)} → ${formatShortDate(endDateMs)}`;

  // Progress & Remaining calculations
  const isUpcoming = startDateMs > nowMs;
  const isExpired = status === "expired" || status === "terminated" || endDateMs < nowMs;
  const elapsedDays = isUpcoming
    ? 0
    : Math.min(totalDays, Math.max(0, Math.floor((nowMs - startDateMs) / DAY_MS)));
  const rawDaysRemaining = Math.ceil((endDateMs - nowMs) / DAY_MS);
  const daysRemaining = isExpired ? 0 : Math.max(0, rawDaysRemaining);
  const daysOverdueRenewal = endDateMs < nowMs ? Math.ceil((nowMs - endDateMs) / DAY_MS) : 0;
  const isOverdueRenewal = daysOverdueRenewal > 0 && status !== "terminated" && status !== "renewed";

  const progressPct = isUpcoming
    ? 0
    : isExpired
      ? 100
      : Math.min(100, Math.max(0, Math.round(((nowMs - startDateMs) / Math.max(1, endDateMs - startDateMs)) * 100)));

  const isExpiringSoon =
    !isExpired && !isUpcoming && daysRemaining <= 30 && (status === "active" || status === "renewed");

  let remainingLabel = `${daysRemaining} days remaining`;
  if (status === "terminated") {
    remainingLabel = "Terminated";
  } else if (isUpcoming) {
    const startsIn = Math.max(1, Math.ceil((startDateMs - nowMs) / DAY_MS));
    remainingLabel = `Starts in ${startsIn} ${startsIn === 1 ? "day" : "days"}`;
  } else if (endDateMs < nowMs) {
    remainingLabel = `Ended ${daysOverdueRenewal} ${daysOverdueRenewal === 1 ? "day" : "days"} ago`;
  } else if (daysRemaining === 0) {
    remainingLabel = "Ends today";
  }

  // Calculate billing cycles & total contract value over the selected date range
  const effectiveMonths = totalMonths + extraDays / 30.4375;
  let totalCycles = 1;
  let monthlyEquivalentMinor = amountMinor;

  if (billingCycleNormalized === "monthly") {
    totalCycles = Math.max(1, Number((effectiveMonths / intervalCount).toFixed(2)));
    monthlyEquivalentMinor = Math.round(amountMinor / intervalCount);
  } else if (billingCycleNormalized === "quarterly") {
    totalCycles = Math.max(1, Number((effectiveMonths / (3 * intervalCount)).toFixed(2)));
    monthlyEquivalentMinor = Math.round(amountMinor / (3 * intervalCount));
  } else if (billingCycleNormalized === "half_yearly") {
    totalCycles = Math.max(1, Number((effectiveMonths / (6 * intervalCount)).toFixed(2)));
    monthlyEquivalentMinor = Math.round(amountMinor / (6 * intervalCount));
  } else if (billingCycleNormalized === "yearly") {
    totalCycles = Math.max(1, Number((effectiveMonths / (12 * intervalCount)).toFixed(2)));
    monthlyEquivalentMinor = Math.round(amountMinor / (12 * intervalCount));
  } else if (billingCycleNormalized === "every_n_days") {
    const stepDays = Math.max(1, intervalCount);
    totalCycles = Math.max(1, Number((totalDays / stepDays).toFixed(2)));
    monthlyEquivalentMinor = Math.round((amountMinor * 30.4375) / stepDays);
  }

  // Snap near-integer cycle counts (e.g. 11.98 -> 12) for clean calendar date ranges
  if (Math.abs(totalCycles - Math.round(totalCycles)) <= 0.08) {
    totalCycles = Math.max(1, Math.round(totalCycles));
  }

  const totalContractValueMinor = Math.round(amountMinor * totalCycles);
  const annualEquivalentMinor = monthlyEquivalentMinor * 12;

  const nextBillingDateMs = computeNextBillingDateMs({
    isOneTime: false,
    cycle: billingCycleNormalized,
    startMs: startDateMs,
    endMs: endDateMs,
    intervalCount,
    anchorDay: input.anchorDay,
    status,
    nowMs,
  });

  const nextBillingDateLabel = nextBillingDateMs
    ? formatShortDate(nextBillingDateMs)
    : isExpired
      ? "Tenure Completed"
      : "—";

  return {
    isOneTime: false,
    billingCycleNormalized,
    cycleLabel,
    startDateMs,
    endDateMs,
    totalDays,
    calendarYears: years,
    calendarMonths: months,
    totalCalendarMonths: totalMonths,
    extraDays,
    tenureLabel,
    shortTenureLabel,
    dateRangeLabel,
    elapsedDays,
    daysRemaining,
    daysOverdueRenewal,
    isOverdueRenewal,
    progressPct,
    isUpcoming,
    isExpired,
    isExpiringSoon,
    remainingLabel,
    totalCycles,
    totalContractValueMinor,
    monthlyEquivalentMinor,
    annualEquivalentMinor,
    nextBillingDateMs,
    nextBillingDateLabel,
  };
}

/**
 * Selects the primary contract for a client to display in headers, tables, dashboards, and embeds.
 */
export function pickPrimaryClientContract<
  T extends {
    status?: string | null;
    validTo?: number | string | Date | null;
    validFrom?: number | string | Date | null;
    createdAt?: number | string | Date | null;
  },
>(contracts: T[] | null | undefined): T | null {
  if (!contracts || contracts.length === 0) return null;
  const priority = (status?: string | null) => {
    const s = (status || "").toLowerCase();
    if (s === "active") return 4;
    if (s === "renewed") return 3;
    if (s === "draft") return 2;
    if (s === "expired") return 1;
    return 0;
  };
  const sorted = [...contracts].sort((a, b) => {
    const pDiff = priority(b.status) - priority(a.status);
    if (pDiff !== 0) return pDiff;
    return toEpochMs(b.validTo, 0) - toEpochMs(a.validTo, 0);
  });
  return sorted[0] || null;
}
