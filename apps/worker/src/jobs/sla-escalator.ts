import {
  DrizzleTicketRepository,
  type Ticket,
  type TicketLevel,
} from "@rsl/core/support";
import { getRealtimeHub, type RealtimeHub } from "@rsl/core/events";
import { getContainer } from "@rsl/core/container";
import { renderTicketEscalationEmail } from "@rsl/core/settings";

export interface SlaEscalatorOptions {
  workerId: string;
  pollIntervalMs?: number; // default 60,000ms (60s)
}

export class SlaEscalatorJob {
  private isRunning = false;
  private isStopped = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly ticketRepo: DrizzleTicketRepository;
  private readonly realtimeHub: RealtimeHub;

  constructor(private readonly options: SlaEscalatorOptions) {
    this.ticketRepo = new DrizzleTicketRepository();
    this.realtimeHub = getRealtimeHub();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isStopped = false;
    const interval = this.options.pollIntervalMs ?? 60_000;
    console.log(
      `[SlaEscalatorJob] Started SLA escalator daemon (poll interval: ${interval}ms)`,
    );
    void this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.isStopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;
    try {
      this.timer = setTimeout(() => {
        void this.runCycle().catch((err) => {
          console.error("[SlaEscalatorJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[SlaEscalatorJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    const now = Date.now();

    try {
      const breachedTickets = await this.ticketRepo.findTicketsDueForEscalation(now);

      if (breachedTickets.length > 0) {
        console.log(
          `[SlaEscalatorJob] Found ${breachedTickets.length} ticket(s) due for SLA breach escalation.`,
        );
      }

      for (const ticket of breachedTickets) {
        if (this.isStopped) break;

        try {
          const fromLevel = ticket.level;
          const targetLevel: TicketLevel = fromLevel === "L1" ? "L2" : "L3";
          const isFirstResponseBreach =
            fromLevel === "L1" &&
            !ticket.firstRespondedAt &&
            now > ticket.firstResponseDueAt;

          const reason = isFirstResponseBreach
            ? `Auto-escalated to ${targetLevel} due to first response SLA breach`
            : `Auto-escalated to ${targetLevel} due to resolution SLA breach`;

          // 1. Mark SLA breach flag on domain entity
          ticket.checkAndMarkSlaBreach(now);

          // 2. Advance escalation tier (L1 -> L2 or L2 -> L3)
          ticket.escalate(reason, "system", targetLevel, now);

          // 3. Persist ticket state and append domain events (TicketEscalated, SlaBreached) to outbox
          await this.ticketRepo.save(ticket);

          console.log(
            `[SlaEscalatorJob] Auto-escalated ticket ${ticket.number} (${ticket.id}) from ${fromLevel} to ${targetLevel}`,
          );

          // 4. Realtime SSE broadcast (<3s latency requirement)
          const sseEvent = {
            id: `evt_${now}_${ticket.id}`,
            topic: "tickets",
            type: "ticket.escalated",
            clientId: ticket.clientId,
            payload: {
              ticketId: ticket.id,
              number: ticket.number,
              clientId: ticket.clientId,
              fromLevel,
              toLevel: targetLevel,
              level: targetLevel,
              status: ticket.status,
              slaBreached: ticket.isSlaBreached,
              reason,
            },
            timestamp: now,
          };

          this.realtimeHub.publish("tickets", { ...sseEvent, topic: "tickets" });
          this.realtimeHub.publish(`client:${ticket.clientId}:tickets`, {
            ...sseEvent,
            topic: `client:${ticket.clientId}:tickets`,
          });
          this.realtimeHub.publish(`ticket:${ticket.id}`, {
            ...sseEvent,
            topic: `ticket:${ticket.id}`,
          });

          // 5. Trigger email notification alert for the escalation
          await this.sendEscalationEmail(ticket, fromLevel, targetLevel, reason);
        } catch (ticketErr) {
          console.error(
            `[SlaEscalatorJob] Error processing escalation for ticket ${ticket.id}:`,
            ticketErr,
          );
        }
      }
    } catch (err) {
      console.error("[SlaEscalatorJob] Error executing SLA escalation cycle:", err);
    } finally {
      if (this.isRunning) {
        this.scheduleNext(this.options.pollIntervalMs ?? 60_000);
      }
    }
  }

  private async sendEscalationEmail(
    ticket: Ticket,
    fromLevel: TicketLevel,
    toLevel: TicketLevel,
    reason: string,
  ): Promise<void> {
    try {
      const container = getContainer();
      const settingsModule = container.settingsModule;
      const clientsModule = container.clientsModule;

      const [companySettings, emailSettings, client, contacts] = await Promise.all([
        settingsModule.repo.getCompanySettings().catch(() => null),
        settingsModule.repo.getEmailSettings().catch(() => null),
        clientsModule.repo.findById(ticket.clientId).catch(() => null),
        clientsModule.repo.findContactsByClient(ticket.clientId).catch(() => []),
      ]);

      const clientName = client?.name || "Valued Client";
      const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];
      const targetEmail =
        primaryContact?.email ||
        companySettings?.email ||
        emailSettings?.fromEmail;

      if (!targetEmail) {
        console.warn(
          `[SlaEscalatorJob] No recipient email found for escalated ticket ${ticket.number}`,
        );
        return;
      }

      const rendered = renderTicketEscalationEmail({
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
        clientName,
        priority: ticket.priority,
        fromLevel,
        toLevel,
        reason,
        portalUrl: `/portal/support`,
        firmName: companySettings?.legalName || "RapidShift Labs Private Limited",
      });

      await settingsModule.emailSender.send({
        to: targetEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      console.log(
        `[SlaEscalatorJob] Dispatched SLA escalation email alert for ticket ${ticket.number} (${fromLevel} -> ${toLevel}) to ${targetEmail}`,
      );
    } catch (emailErr) {
      console.error(
        `[SlaEscalatorJob] Failed dispatching escalation email for ticket ${ticket.number}:`,
        emailErr,
      );
    }
  }
}

export function startSlaEscalator(options: SlaEscalatorOptions): SlaEscalatorJob {
  const job = new SlaEscalatorJob(options);
  job.start();
  return job;
}
