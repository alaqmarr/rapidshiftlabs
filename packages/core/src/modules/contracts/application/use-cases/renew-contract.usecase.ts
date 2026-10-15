import type { ContractRepository } from "../../domain/repositories/contract-repository.port";
import type { Contract } from "../../domain/entities/contract.entity";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class RenewContractUseCase {
  constructor(private readonly repo: ContractRepository) {}

  async execute(id: string, newValidTo: number): Promise<Contract> {
    const contract = await this.repo.findById(id);
    if (!contract) {
      throw new NotFoundError("Contract", id);
    }

    contract.renew(newValidTo);
    await this.repo.update(contract);
    return contract;
  }
}
