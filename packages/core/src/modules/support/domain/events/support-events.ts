import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export type TicketCreatedEvent = DomainEvent<
  "TicketCreated",
  {
    ticketId: string;
    number: string;
    clientId: string;
    projectId?: string | null;
    subject: string;
    priority: "P1" | "P2" | "P3" | "P4";
    level: "L1" | "L2" | "L3";
  }
>;

export type TicketMessageAddedEvent = DomainEvent<
  "TicketMessageAdded",
  {
    ticketId: string;
    messageId: string;
    clientId: string;
    authorId: string;
    authorType: "admin" | "client" | "system";
    authorName: string;
    isInternal: boolean;
    body: string;
  }
>;

export type TicketStatusChangedEvent = DomainEvent<
  "TicketStatusChanged",
  {
    ticketId: string;
    clientId: string;
    oldStatus: string;
    newStatus: string;
    reason?: string;
  }
>;

export type TicketEscalatedEvent = DomainEvent<
  "TicketEscalated",
  {
    ticketId: string;
    clientId: string;
    fromLevel: "L1" | "L2" | "L3";
    toLevel: "L1" | "L2" | "L3";
    reason: string;
    triggeredBy: "system" | "staff" | "client";
  }
>;

export type SlaBreachedEvent = DomainEvent<
  "SlaBreached",
  {
    ticketId: string;
    clientId: string;
    priority: "P1" | "P2" | "P3" | "P4";
    level: "L1" | "L2" | "L3";
    breachType: "first_response" | "resolution";
    dueAt: number;
  }
>;
