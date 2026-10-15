import { Contract, type CreateContractParams } from "../../domain/entities/contract.entity";
import type { ContractRepository } from "../../domain/repositories/contract-repository.port";

export class CreateContractUseCase {
  constructor(private readonly repo: ContractRepository) {}

  async execute(params: CreateContractParams): Promise<Contract> {
    const contract = Contract.create(params);
    await this.repo.create(contract);
    return contract;
  }
}
