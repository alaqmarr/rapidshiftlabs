import { Ticket, type TicketPriority, type TicketLevel, type TicketStatus } from "../entities/ticket.entity";
import { TicketMessage } from "../entities/ticket-message.entity";
import { CannedReply } from "../entities/canned-reply.entity";

export interface TicketFilter {
  clientId?: string | null;
  projectId?: string | null;
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  level?: TicketLevel;
  assigneeId?: string | null;
  limit?: number;
  offset?: number;
}

export interface ITicketRepository {
  save(ticket: Ticket): Promise<void>;
  findById(id: string): Promise<Ticket | null>;
  findByNumber(number: string): Promise<Ticket | null>;
  findByLinkedIncidentId(incidentId: string): Promise<Ticket | null>;
  findTicketsDueForEscalation(now: number): Promise<Ticket[]>;
  list(filter?: TicketFilter): Promise<Ticket[]>;
  count(filter?: TicketFilter): Promise<number>;

  // Messages
  saveMessage(message: TicketMessage): Promise<void>;
  listMessages(ticketId: string, includeInternal?: boolean): Promise<TicketMessage[]>;

  // Canned Replies
  saveCannedReply(reply: CannedReply): Promise<void>;
  listCannedReplies(category?: string): Promise<CannedReply[]>;
  deleteCannedReply(id: string): Promise<void>;
}
