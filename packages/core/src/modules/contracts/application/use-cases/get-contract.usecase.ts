import type { ContractRepository } from "../../domain/repositories/contract-repository.port";
import type { Contract } from "../../domain/entities/contract.entity";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class GetContractUseCase {
  constructor(private readonly repo: ContractRepository) {}

  async execute(idOrCode: string): Promise<Contract> {
    let contract = await this.repo.findById(idOrCode);
    if (!contract) {
      contract = await this.repo.findByCode(idOrCode);
    }
    if (!contract) {
      throw new NotFoundError("Contract", idOrCode);
    }
    return contract;
  }
}
