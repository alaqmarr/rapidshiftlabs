import { DrizzleContractRepository } from "./infrastructure/repositories/drizzle-contract.repository";
import { CreateContractUseCase } from "./application/use-cases/create-contract.usecase";
import {
  ActivateContractUseCase,
  type EventPublisherPort,
} from "./application/use-cases/activate-contract.usecase";
import { TerminateContractUseCase } from "./application/use-cases/terminate-contract.usecase";
import { RenewContractUseCase } from "./application/use-cases/renew-contract.usecase";
import { GetContractUseCase } from "./application/use-cases/get-contract.usecase";
import { ListContractsUseCase } from "./application/use-cases/list-contracts.usecase";
import type { ContractRepository } from "./domain/repositories/contract-repository.port";
import { DrizzleEventOutboxRepository } from "../../shared/infrastructure/events/outbox-repository";

import { ReactPdfContractRenderer } from "./infrastructure/pdf/react-pdf-contract-renderer";
import type { ContractPdfRendererPort } from "./application/ports/contract-pdf-renderer.port";

export * from "./domain/entities/contract.entity";
export * from "./domain/entities/contract-item.entity";
export * from "./domain/events/contract-events";
export * from "./domain/repositories/contract-repository.port";
export * from "./application/ports/contract-pdf-renderer.port";
export * from "./application/use-cases/create-contract.usecase";
export * from "./application/use-cases/activate-contract.usecase";
export * from "./application/use-cases/terminate-contract.usecase";
export * from "./application/use-cases/renew-contract.usecase";
export * from "./application/use-cases/get-contract.usecase";
export * from "./application/use-cases/list-contracts.usecase";
export * from "./infrastructure/repositories/drizzle-contract.repository";
export * from "./infrastructure/pdf/react-pdf-contract-renderer";

export class ContractsModule {
  public readonly repo: ContractRepository;
  public readonly publisher: EventPublisherPort;
  public readonly pdfRenderer: ContractPdfRendererPort;

  public readonly createContractUseCase: CreateContractUseCase;
  public readonly activateContractUseCase: ActivateContractUseCase;
  public readonly terminateContractUseCase: TerminateContractUseCase;
  public readonly renewContractUseCase: RenewContractUseCase;
  public readonly getContractUseCase: GetContractUseCase;
  public readonly listContractsUseCase: ListContractsUseCase;

  constructor(
    repo?: ContractRepository,
    publisher?: EventPublisherPort,
    pdfRenderer?: ContractPdfRendererPort,
  ) {
    this.repo = repo ?? new DrizzleContractRepository();
    this.publisher = publisher ?? new DrizzleEventOutboxRepository();
    this.pdfRenderer = pdfRenderer ?? new ReactPdfContractRenderer();

    this.createContractUseCase = new CreateContractUseCase(this.repo);
    this.activateContractUseCase = new ActivateContractUseCase(this.repo, this.publisher);
    this.terminateContractUseCase = new TerminateContractUseCase(this.repo, this.publisher);
    this.renewContractUseCase = new RenewContractUseCase(this.repo);
    this.getContractUseCase = new GetContractUseCase(this.repo);
    this.listContractsUseCase = new ListContractsUseCase(this.repo);
  }
}

let instance: ContractsModule | null = null;

export function getContractsModule(): ContractsModule {
  if (!instance) {
    instance = new ContractsModule();
  }
  return instance;
}
