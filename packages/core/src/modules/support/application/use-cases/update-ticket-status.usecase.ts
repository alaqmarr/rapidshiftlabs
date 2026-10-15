import type { ITicketRepository } from "../../domain/ports/ticket-repository.port";
import { UpdateStatusSchema, type UpdateStatusDTO } from "../dtos/ticket.dto";
import {
  type Actor,
  assertCan,
  assertTenant,
  isStaff,
} from "../../../../shared/kernel/actor";
import { ForbiddenError, NotFoundError } from "../../../../shared/kernel/errors";
import type { Ticket } from "../../domain/entities/ticket.entity";

export class UpdateTicketStatusUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async execute(input: UpdateStatusDTO, actor: Actor): Promise<Ticket> {
    assertCan(actor, "support:write");
    const validated = UpdateStatusSchema.parse(input);

    const ticket = await this.repo.findById(validated.ticketId);
    if (!ticket) {
      throw new NotFoundError(`Ticket ${validated.ticketId} not found`);
    }

    assertTenant(actor, ticket.clientId);

    if (!isStaff(actor)) {
      // Clients can only close or reopen
      if (validated.status !== "closed" && validated.status !== "in_progress") {
        throw new ForbiddenError("Clients can only close or reopen tickets");
      }
    }

    ticket.updateStatus(validated.status, Date.now(), validated.reason);
    await this.repo.save(ticket);

    return ticket;
  }
}
