import type { ITicketRepository, TicketFilter } from "../../domain/ports/ticket-repository.port";
import type { Ticket } from "../../domain/entities/ticket.entity";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";

export class ListTicketsUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async execute(filter: TicketFilter, actor: Actor): Promise<{ tickets: Ticket[]; total: number }> {
    assertCan(actor, "support:read");
    const scopedClientId = scopeClientId(actor, filter.clientId);
    const resolvedFilter: TicketFilter = {
      ...filter,
      clientId: scopedClientId,
    };

    const tickets = await this.repo.list(resolvedFilter);
    const total = await this.repo.count(resolvedFilter);

    return { tickets, total };
  }
}
