import type { ITicketRepository } from "../../domain/ports/ticket-repository.port";
import type { Ticket } from "../../domain/entities/ticket.entity";
import type { TicketMessage } from "../../domain/entities/ticket-message.entity";
import { type Actor, assertCan, assertTenant, isStaff } from "../../../../shared/kernel/actor";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class GetTicketUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async execute(
    ticketId: string,
    actor: Actor,
  ): Promise<{ ticket: Ticket; messages: TicketMessage[] }> {
    assertCan(actor, "support:read");

    const ticket = await this.repo.findById(ticketId);
    if (!ticket) {
      throw new NotFoundError(`Ticket ${ticketId} not found`);
    }

    assertTenant(actor, ticket.clientId);

    const includeInternal = isStaff(actor);
    const messages = await this.repo.listMessages(ticket.id, includeInternal);

    return { ticket, messages };
  }
}
