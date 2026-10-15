import { describe, it, expect } from "vitest";
import {
  Ticket,
  SLA_POLICIES,
  type TicketPriority,
  type TicketStatus,
} from "../../../src/modules/support/domain/entities/ticket.entity";
import { TicketMessage } from "../../../src/modules/support/domain/entities/ticket-message.entity";

describe("Support Desk — Ticket Domain Aggregate", () => {
  it("calculates correct 24x7 SLA deadlines based on priority tier", () => {
    const now = 1700000000000;

    const priorities: TicketPriority[] = ["P1", "P2", "P3", "P4"];
    for (const priority of priorities) {
      const ticket = Ticket.create({
        clientId: "cli_acme_corp",
        number: `TICK-${priority}`,
        category: "outage",
        subject: `Critical issue for ${priority}`,
        priority,
        source: "portal",
        createdAt: now,
      });

      const sla = SLA_POLICIES[priority];
      expect(ticket.firstResponseDueAt).toBe(now + sla.firstResponseMs);
      expect(ticket.resolutionDueAt).toBe(now + sla.resolutionMs);
      expect(ticket.level).toBe("L1");
      expect(ticket.status).toBe("open");
      expect(ticket.slaBreached).toBe(false);
    }
  });

  it("handles SLA pause and clock extension on waiting_on_client status", () => {
    const start = 1700000000000;
    const ticket = Ticket.create({
      clientId: "cli_acme_corp",
      number: "TICK-PAUSE-01",
      category: "question",
      subject: "Waiting for clarification",
      priority: "P3", // 4h response, 24h resolution
      createdAt: start,
    });

    const origRespDue = ticket.firstResponseDueAt;
    const origResolDue = ticket.resolutionDueAt;

    // Transition to waiting_on_client 1 hour later
    const pauseTime = start + 3600000;
    ticket.updateStatus("waiting_on_client", pauseTime, "Need more log info");

    expect(ticket.status).toBe("waiting_on_client");
    expect(ticket.slaPausedAt).toBe(pauseTime);

    // Resume 2 hours later (paused for 7,200,000 ms)
    const resumeTime = pauseTime + 7200000;
    ticket.updateStatus("in_progress", resumeTime, "Client replied with logs");

    expect(ticket.status).toBe("in_progress");
    expect(ticket.slaPausedAt).toBeNull();
    expect(ticket.totalPausedMs).toBe(7200000);

    // Deadlines must be shifted forward by exact pause duration
    expect(ticket.firstResponseDueAt).toBe(origRespDue + 7200000);
    expect(ticket.resolutionDueAt).toBe(origResolDue + 7200000);
  });

  it("advances escalation levels from L1 -> L2 -> L3 and caps at L3", () => {
    const ticket = Ticket.create({
      clientId: "cli_test",
      number: "TICK-ESC-01",
      category: "bug",
      subject: "Bug escalation test",
      priority: "P2",
    });

    expect(ticket.level).toBe("L1");

    ticket.escalate("Breached response time", "system", "L2");
    expect(ticket.level).toBe("L2");
    expect(ticket.status).toBe("escalated");

    ticket.escalate("Duty lead paging required", "staff", "L3");
    expect(ticket.level).toBe("L3");

    // Attempting to escalate beyond L3 should remain L3
    ticket.escalate("Beyond maximum", "staff", "L3");
    expect(ticket.level).toBe("L3");
  });

  it("records CSAT rating between 1 and 5 and rejects invalid values", () => {
    const ticket = Ticket.create({
      clientId: "cli_test",
      number: "TICK-CSAT-01",
      category: "bug",
      subject: "CSAT rating test",
      priority: "P3",
    });

    expect(() => ticket.submitCsat(0)).toThrow();
    expect(() => ticket.submitCsat(6)).toThrow();

    ticket.submitCsat(5, "Outstanding and prompt fix!");
    expect(ticket.csatRating).toBe(5);
    expect(ticket.csatFeedback).toBe("Outstanding and prompt fix!");
  });

  it("supports public replies and private internal notes", () => {
    const publicMsg = TicketMessage.create({
      ticketId: "tkt_123",
      senderId: "usr_client",
      senderName: "Client Alice",
      senderType: "client",
      body: "Our server is returning 502 errors.",
      isInternal: false,
    });
    expect(publicMsg.isInternal).toBe(false);

    const internalNote = TicketMessage.create({
      ticketId: "tkt_123",
      senderId: "adm_staff",
      senderName: "Engineer Bob",
      senderType: "staff",
      body: "Internal: PM2 restarted due to OOM killer. Investigating memory leak.",
      isInternal: true,
    });
    expect(internalNote.isInternal).toBe(true);
  });
});
