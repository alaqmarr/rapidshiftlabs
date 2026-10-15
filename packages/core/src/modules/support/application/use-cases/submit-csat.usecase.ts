import type { ITicketRepository } from "../../domain/ports/ticket-repository.port";
import { SubmitCsatSchema, type SubmitCsatDTO } from "../dtos/ticket.dto";
import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";
import { NotFoundError } from "../../../../shared/kernel/errors";
import type { Ticket } from "../../domain/entities/ticket.entity";

export class SubmitCsatUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async execute(input: SubmitCsatDTO, actor: Actor): Promise<Ticket> {
    assertCan(actor, "support:write");
    const validated = SubmitCsatSchema.parse(input);

    const ticket = await this.repo.findById(validated.ticketId);
    if (!ticket) {
      throw new NotFoundError(`Ticket ${validated.ticketId} not found`);
    }

    assertTenant(actor, ticket.clientId);

    ticket.submitCsat(validated.rating, validated.feedback);
    await this.repo.save(ticket);

    return ticket;
  }
}
