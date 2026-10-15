import type { ITicketRepository } from "../../domain/ports/ticket-repository.port";
import { EscalateTicketSchema, type EscalateTicketDTO } from "../dtos/ticket.dto";
import {
  type Actor,
  assertCan,
  assertTenant,
  isStaff,
} from "../../../../shared/kernel/actor";
import { NotFoundError } from "../../../../shared/kernel/errors";
import type { Ticket } from "../../domain/entities/ticket.entity";

export class EscalateTicketUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async execute(input: EscalateTicketDTO, actor: Actor): Promise<Ticket> {
    assertCan(actor, "support:escalate");
    const validated = EscalateTicketSchema.parse(input);

    const ticket = await this.repo.findById(validated.ticketId);
    if (!ticket) {
      throw new NotFoundError(`Ticket ${validated.ticketId} not found`);
    }

    assertTenant(actor, ticket.clientId);

    const triggeredBy =
      actor.kind === "system"
        ? "system"
        : isStaff(actor)
          ? "staff"
          : "client";

    ticket.escalate(validated.reason, triggeredBy, validated.targetLevel);
    await this.repo.save(ticket);

    return ticket;
  }
}
