import type { BillingRepository } from "../../domain/repositories/billing-repository.port";
import {
  BillingPeriodGenerator,
  type GenerateBillingPeriodsInput,
} from "../../domain/services/billing-period-generator";
import { BillingPeriod } from "../../domain/entities/billing-period.entity";

export class GenerateScheduleUseCase {
  constructor(private readonly repo: BillingRepository) {}

  async execute(input: GenerateBillingPeriodsInput): Promise<BillingPeriod[]> {
    const rawPeriods = BillingPeriodGenerator.generate(input);
    const now = Date.now();
    const periods = rawPeriods.map(
      (p) =>
        new BillingPeriod({
          ...p,
          invoiceId: null,
          createdAt: now,
          updatedAt: now,
        }),
    );

    if (periods.length > 0) {
      await this.repo.saveBillingPeriods(periods);
    }
    return periods;
  }
}
