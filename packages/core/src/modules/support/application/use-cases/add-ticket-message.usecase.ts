import { TicketMessage } from "../../domain/entities/ticket-message.entity";
import type { ITicketRepository } from "../../domain/ports/ticket-repository.port";
import { AddMessageSchema, type AddMessageDTO } from "../dtos/ticket.dto";
import {
  type Actor,
  assertCan,
  assertTenant,
  isStaff,
} from "../../../../shared/kernel/actor";
import { ForbiddenError, NotFoundError } from "../../../../shared/kernel/errors";
import { createEvent } from "../../../../shared/kernel/domain-event";

export class AddTicketMessageUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async execute(input: AddMessageDTO, actor: Actor): Promise<TicketMessage> {
    assertCan(actor, "support:write");
    const validated = AddMessageSchema.parse(input);

    const ticket = await this.repo.findById(validated.ticketId);
    if (!ticket) {
      throw new NotFoundError(`Ticket ${validated.ticketId} not found`);
    }

    assertTenant(actor, ticket.clientId);

    // Only staff can add internal notes
    if (validated.isInternal && !isStaff(actor)) {
      throw new ForbiddenError("Clients cannot create internal notes");
    }

    const authorType: "admin" | "client" | "system" =
      actor.kind === "admin" ? "admin" : actor.kind === "system" ? "system" : "client";

    const authorName =
      actor.kind === "admin" || actor.kind === "client_user"
        ? actor.name
        : actor.kind === "system"
          ? "System"
          : "API";

    const message = TicketMessage.create({
      ticketId: ticket.id,
      authorId: (actor as any).id ?? "system",
      authorType,
      authorName,
      body: validated.body,
      isInternal: validated.isInternal,
    });

    // Update ticket lifecycle state
    if (isStaff(actor)) {
      ticket.recordFirstResponse();
    } else {
      // Client response resumes paused ticket or reopens resolved ticket
      if (ticket.status === "waiting_on_client") {
        ticket.updateStatus("in_progress", Date.now(), "Client replied to ticket");
      } else if (ticket.status === "resolved") {
        ticket.updateStatus("in_progress", Date.now(), "Client reopened ticket with new message");
      }
    }

    await this.repo.saveMessage(message);
    await this.repo.save(ticket);

    return message;
  }
}
