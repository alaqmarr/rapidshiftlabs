import { DrizzleTicketRepository } from "./infrastructure/repositories/drizzle-ticket.repository";
import type { ITicketRepository } from "./domain/ports/ticket-repository.port";
import { CreateTicketUseCase } from "./application/use-cases/create-ticket.usecase";
import { AddTicketMessageUseCase } from "./application/use-cases/add-ticket-message.usecase";
import { EscalateTicketUseCase } from "./application/use-cases/escalate-ticket.usecase";
import { UpdateTicketStatusUseCase } from "./application/use-cases/update-ticket-status.usecase";
import { SubmitCsatUseCase } from "./application/use-cases/submit-csat.usecase";
import { ManageCannedRepliesUseCase } from "./application/use-cases/manage-canned-replies.usecase";
import { ListTicketsUseCase } from "./application/use-cases/list-tickets.usecase";
import { GetTicketUseCase } from "./application/use-cases/get-ticket.usecase";

// Domain exports
export * from "./domain/entities/ticket.entity";
export * from "./domain/entities/ticket-message.entity";
export * from "./domain/entities/canned-reply.entity";
export * from "./domain/events/support-events";
export * from "./domain/ports/ticket-repository.port";

// Application exports
export * from "./application/dtos/ticket.dto";
export * from "./application/use-cases/create-ticket.usecase";
export * from "./application/use-cases/add-ticket-message.usecase";
export * from "./application/use-cases/escalate-ticket.usecase";
export * from "./application/use-cases/update-ticket-status.usecase";
export * from "./application/use-cases/submit-csat.usecase";
export * from "./application/use-cases/manage-canned-replies.usecase";
export * from "./application/use-cases/list-tickets.usecase";
export * from "./application/use-cases/get-ticket.usecase";

// Infrastructure exports
export * from "./infrastructure/repositories/drizzle-ticket.repository";

export interface SupportModuleDependencies {
  ticketRepo?: ITicketRepository;
}

export class SupportModule {
  public readonly ticketRepo: ITicketRepository;

  public readonly createTicketUseCase: CreateTicketUseCase;
  public readonly addTicketMessageUseCase: AddTicketMessageUseCase;
  public readonly escalateTicketUseCase: EscalateTicketUseCase;
  public readonly updateTicketStatusUseCase: UpdateTicketStatusUseCase;
  public readonly submitCsatUseCase: SubmitCsatUseCase;
  public readonly manageCannedRepliesUseCase: ManageCannedRepliesUseCase;
  public readonly listTicketsUseCase: ListTicketsUseCase;
  public readonly getTicketUseCase: GetTicketUseCase;

  constructor(deps?: SupportModuleDependencies) {
    this.ticketRepo = deps?.ticketRepo ?? new DrizzleTicketRepository();

    this.createTicketUseCase = new CreateTicketUseCase(this.ticketRepo);
    this.addTicketMessageUseCase = new AddTicketMessageUseCase(this.ticketRepo);
    this.escalateTicketUseCase = new EscalateTicketUseCase(this.ticketRepo);
    this.updateTicketStatusUseCase = new UpdateTicketStatusUseCase(this.ticketRepo);
    this.submitCsatUseCase = new SubmitCsatUseCase(this.ticketRepo);
    this.manageCannedRepliesUseCase = new ManageCannedRepliesUseCase(this.ticketRepo);
    this.listTicketsUseCase = new ListTicketsUseCase(this.ticketRepo);
    this.getTicketUseCase = new GetTicketUseCase(this.ticketRepo);
  }
}

let supportModuleInstance: SupportModule | null = null;

export function getSupportModule(deps?: SupportModuleDependencies): SupportModule {
  if (!supportModuleInstance || deps) {
    supportModuleInstance = new SupportModule(deps);
  }
  return supportModuleInstance;
}
