import type {
  BillingRepository,
  BillingSummaryDTO,
} from "../../domain/repositories/billing-repository.port";

export class GetBillingSummaryUseCase {
  constructor(private readonly repo: BillingRepository) {}

  async execute(clientId?: string): Promise<BillingSummaryDTO> {
    return this.repo.getBillingSummary(clientId);
  }
}
