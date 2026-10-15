import type {
  ContractRepository,
  ListContractsQuery,
} from "../../domain/repositories/contract-repository.port";
import type { Contract } from "../../domain/entities/contract.entity";

export class ListContractsUseCase {
  constructor(private readonly repo: ContractRepository) {}

  async execute(query?: ListContractsQuery): Promise<{ items: Contract[]; total: number }> {
    return this.repo.list(query);
  }
}
