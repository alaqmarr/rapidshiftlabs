import { describe, it, expect } from "vitest";
import { BillingPeriodGenerator } from "../src/modules/billing/domain/services/billing-period-generator";
import { fromDateKey, toDateKey } from "../src/shared/kernel/time";

describe("BillingPeriodGenerator Unit Tests", () => {
  const contractId = "ctr_test_01";
  const clientId = "cli_test_01";
  const amountMinor = 100000; // ₹1,000.00
  const currency = "INR";

  it("schedules a single period for one_time billing cycle", () => {
    const validFrom = fromDateKey("2026-04-01");
    const validTo = fromDateKey("2026-06-30");

    const periods = BillingPeriodGenerator.generate({
      contractId,
      clientId,
      amountMinor,
      currency,
      billingCycle: "one_time",
      validFrom,
      validTo,
      paymentTermsDays: 15,
    });

    expect(periods).toHaveLength(1);
    expect(periods[0]!.periodNumber).toBe(1);
    expect(periods[0]!.amountMinor).toBe(amountMinor);
    expect(toDateKey(periods[0]!.periodStart)).toBe("2026-04-01");
    expect(periods[0]!.status).toBe("pending");
  });

  it("schedules monthly periods with exact anchor day 1", () => {
    // 3 full months: April, May, June 2026
    const validFrom = fromDateKey("2026-04-01");
    const validTo = fromDateKey("2026-06-30");

    const periods = BillingPeriodGenerator.generate({
      contractId,
      clientId,
      amountMinor,
      currency,
      billingCycle: "monthly",
      anchorDay: 1,
      validFrom,
      validTo,
      paymentTermsDays: 15,
    });

    expect(periods).toHaveLength(3);

    // Period 1: Apr 1 - Apr 30
    expect(periods[0]!.periodNumber).toBe(1);
    expect(toDateKey(periods[0]!.periodStart)).toBe("2026-04-01");
    expect(toDateKey(periods[0]!.periodEnd)).toBe("2026-04-30");
    expect(periods[0]!.amountMinor).toBe(amountMinor);

    // Period 2: May 1 - May 31
    expect(periods[1]!.periodNumber).toBe(2);
    expect(toDateKey(periods[1]!.periodStart)).toBe("2026-05-01");
    expect(toDateKey(periods[1]!.periodEnd)).toBe("2026-05-31");
    expect(periods[1]!.amountMinor).toBe(amountMinor);

    // Period 3: Jun 1 - Jun 30
    expect(periods[2]!.periodNumber).toBe(3);
    expect(toDateKey(periods[2]!.periodStart)).toBe("2026-06-01");
    expect(toDateKey(periods[2]!.periodEnd)).toBe("2026-06-30");
    expect(periods[2]!.amountMinor).toBe(amountMinor);
  });

  it("handles month-end clamping for anchor day 31 (Jan 31 -> Feb 28 -> Mar 31)", () => {
    // 2027 is a non-leap year (Feb has 28 days)
    const validFrom = fromDateKey("2027-01-31");
    const validTo = fromDateKey("2027-04-29");

    const periods = BillingPeriodGenerator.generate({
      contractId,
      clientId,
      amountMinor,
      currency,
      billingCycle: "monthly",
      anchorDay: 31,
      validFrom,
      validTo,
    });

    expect(periods.length).toBeGreaterThanOrEqual(3);
    // Period 1: Jan 31 -> Feb 27
    expect(toDateKey(periods[0]!.periodStart)).toBe("2027-01-31");
    expect(toDateKey(periods[0]!.periodEnd)).toBe("2027-02-27");

    // Period 2: Feb 28 -> Mar 30
    expect(toDateKey(periods[1]!.periodStart)).toBe("2027-02-28");
    expect(toDateKey(periods[1]!.periodEnd)).toBe("2027-03-30");

    // Period 3: Mar 31 -> Apr 29 (clamped to validTo)
    expect(toDateKey(periods[2]!.periodStart)).toBe("2027-03-31");
    expect(toDateKey(periods[2]!.periodEnd)).toBe("2027-04-29");
  });

  it("prorates partial first period starting mid-month", () => {
    // Starts on April 16 (15 days out of 30 days in April)
    const validFrom = fromDateKey("2026-04-16");
    const validTo = fromDateKey("2026-05-31");

    const periods = BillingPeriodGenerator.generate({
      contractId,
      clientId,
      amountMinor: 30000, // ₹300.00
      currency,
      billingCycle: "monthly",
      anchorDay: 1,
      validFrom,
      validTo,
    });

    expect(periods).toHaveLength(2);

    // Period 1: Apr 16 - Apr 30 (15 days inclusive).
    // Prorated: 30000 * 15 / 30 = 15000
    expect(toDateKey(periods[0]!.periodStart)).toBe("2026-04-16");
    expect(toDateKey(periods[0]!.periodEnd)).toBe("2026-04-30");
    expect(periods[0]!.amountMinor).toBe(15000);

    // Period 2: May 1 - May 31 (full month, full amount)
    expect(toDateKey(periods[1]!.periodStart)).toBe("2026-05-01");
    expect(toDateKey(periods[1]!.periodEnd)).toBe("2026-05-31");
    expect(periods[1]!.amountMinor).toBe(30000);
  });

  it("schedules quarterly cycles correctly", () => {
    const validFrom = fromDateKey("2026-04-01");
    const validTo = fromDateKey("2026-09-30");

    const periods = BillingPeriodGenerator.generate({
      contractId,
      clientId,
      amountMinor: 120000, // ₹1,200.00 per quarter
      currency,
      billingCycle: "quarterly",
      anchorDay: 1,
      validFrom,
      validTo,
    });

    expect(periods).toHaveLength(2);
    // Q1: Apr 1 to Jun 30
    expect(toDateKey(periods[0]!.periodStart)).toBe("2026-04-01");
    expect(toDateKey(periods[0]!.periodEnd)).toBe("2026-06-30");
    expect(periods[0]!.amountMinor).toBe(120000);

    // Q2: Jul 1 to Sep 30
    expect(toDateKey(periods[1]!.periodStart)).toBe("2026-07-01");
    expect(toDateKey(periods[1]!.periodEnd)).toBe("2026-09-30");
    expect(periods[1]!.amountMinor).toBe(120000);
  });

  it("schedules every_n_days cycle correctly", () => {
    // 14-day sprint cycle over 35 days
    const validFrom = fromDateKey("2026-05-01");
    const validTo = fromDateKey("2026-06-04"); // 35 days (14 + 14 + 7)

    const periods = BillingPeriodGenerator.generate({
      contractId,
      clientId,
      amountMinor: 14000, // ₹140.00 per 14-day sprint
      currency,
      billingCycle: "every_n_days",
      intervalCount: 14,
      validFrom,
      validTo,
    });

    expect(periods).toHaveLength(3);
    // Sprint 1: May 1 - May 14 (14 days, 14000)
    expect(toDateKey(periods[0]!.periodStart)).toBe("2026-05-01");
    expect(toDateKey(periods[0]!.periodEnd)).toBe("2026-05-14");
    expect(periods[0]!.amountMinor).toBe(14000);

    // Sprint 2: May 15 - May 28 (14 days, 14000)
    expect(toDateKey(periods[1]!.periodStart)).toBe("2026-05-15");
    expect(toDateKey(periods[1]!.periodEnd)).toBe("2026-05-28");
    expect(periods[1]!.amountMinor).toBe(14000);

    // Sprint 3: May 29 - Jun 04 (7 days, prorated 50% = 7000)
    expect(toDateKey(periods[2]!.periodStart)).toBe("2026-05-29");
    expect(toDateKey(periods[2]!.periodEnd)).toBe("2026-06-04");
    expect(periods[2]!.amountMinor).toBe(7000);
  });
});
