import { Ticket } from "../../domain/entities/ticket.entity";
import { TicketMessage } from "../../domain/entities/ticket-message.entity";
import type { ITicketRepository } from "../../domain/ports/ticket-repository.port";
import { CreateTicketSchema, type CreateTicketDTO } from "../dtos/ticket.dto";
import {
  type Actor,
  assertCan,
  assertTenant,
  isStaff,
} from "../../../../shared/kernel/actor";

export class CreateTicketUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async execute(input: CreateTicketDTO, actor: Actor): Promise<{ ticket: Ticket; message: TicketMessage }> {
    assertCan(actor, "support:write");
    assertTenant(actor, input.clientId);

    const validated = CreateTicketSchema.parse(input);

    const authorType: "admin" | "client" | "system" =
      actor.kind === "admin" ? "admin" : actor.kind === "system" ? "system" : "client";

    const authorName =
      actor.kind === "admin" || actor.kind === "client_user"
        ? actor.name
        : actor.kind === "system"
          ? "System"
          : "API";

    const ticket = Ticket.create({
      clientId: validated.clientId,
      projectId: validated.projectId,
      category: validated.category,
      subject: validated.subject,
      priority: validated.priority,
      source: validated.source,
      assigneeId: validated.assigneeId,
      assigneeName: validated.assigneeName,
      linkedIncidentId: validated.linkedIncidentId,
      linkedProcessId: validated.linkedProcessId,
    });

    const message = TicketMessage.create({
      ticketId: ticket.id,
      authorId: (actor as any).id ?? "system",
      authorType,
      authorName,
      body: validated.message,
      isInternal: false,
    });

    await this.repo.save(ticket);
    await this.repo.saveMessage(message);

    return { ticket, message };
  }
}
