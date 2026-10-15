import type { ContractRepository } from "../../domain/repositories/contract-repository.port";
import type { Contract } from "../../domain/entities/contract.entity";
import { NotFoundError } from "../../../../shared/kernel/errors";
import type { EventPublisherPort } from "./activate-contract.usecase";

export class TerminateContractUseCase {
  constructor(
    private readonly repo: ContractRepository,
    private readonly publisher?: EventPublisherPort,
  ) {}

  async execute(id: string, reason?: string): Promise<Contract> {
    const contract = await this.repo.findById(id);
    if (!contract) {
      throw new NotFoundError("Contract", id);
    }

    contract.terminate(reason);
    await this.repo.update(contract);

    const events = contract.pullEvents();
    if (this.publisher) {
      for (const ev of events) {
        await this.publisher.publish(ev);
      }
    }

    return contract;
  }
}
