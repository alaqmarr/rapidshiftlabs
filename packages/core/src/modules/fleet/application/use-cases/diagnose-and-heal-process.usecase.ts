import { NotFoundError, ForbiddenError } from "../../../../shared/kernel/errors";
import { SYSTEM_ACTOR } from "../../../../shared/kernel/actor";
import { newId } from "../../../../shared/kernel/id";
import { getRealtimeHub } from "../../../../shared/infrastructure/events/realtime-hub";
import { getWebhookDispatcher } from "../../../../shared/infrastructure/webhooks";
import type { Pm2ProcessRepository } from "../../domain/repositories/pm2-process-repository.port";
import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import type { ProcessActionRepository } from "../../domain/repositories/process-action-repository.port";
import type { SshClientPort } from "../../domain/ports/ssh-client.port";
import type { EncryptionService } from "../../domain/ports/encryption-service.port";
import { GetProcessLogsUseCase } from "./get-process-logs.usecase";
import { RestartProcessUseCase, type RestartActorInput } from "./restart-process.usecase";
import { FleetDiagnosticsService, type ProcessDiagnosticReport } from "../services/fleet-diagnostics.service";

export interface CreateTicketPort {
  execute(input: any, actor: any): Promise<{ ticket: { id: string } }>;
}

export interface DiagnoseAndHealInput {
  processId: string;
  actor: RestartActorInput;
  autoHeal?: boolean;
  cooldownMs?: number;
  createSupportTicketOnFailure?: (ticketData: {
    clientId: string;
    subject: string;
    message: string;
    priority: "P1" | "P2" | "P3";
    linkedProcessId: string;
    linkedIncidentId?: string;
  }) => Promise<{ ticketId: string } | null>;
}

export interface DiagnoseAndHealResult {
  diagnostic: ProcessDiagnosticReport;
  healAttempted: boolean;
  healSuccess?: boolean;
  healMessage?: string;
  ticketCreatedId?: string;
  ticketSkippedCooldown?: boolean;
}

export class DiagnoseAndHealProcessUseCase {
  private static readonly ticketCooldowns = new Map<string, number>();

  public static clearCooldowns(): void {
    DiagnoseAndHealProcessUseCase.ticketCooldowns.clear();
  }

  private readonly getLogsUseCase: GetProcessLogsUseCase;
  private readonly restartUseCase: RestartProcessUseCase;

  constructor(
    private readonly pm2ProcessRepo: Pm2ProcessRepository,
    private readonly serverRepo: ServerRepository,
    private readonly processActionRepo: ProcessActionRepository,
    private readonly sshClient: SshClientPort,
    private readonly encryptionService: EncryptionService,
    private readonly createTicketUseCase?: CreateTicketPort,
    private readonly webhookDispatcher?: {
      dispatch: (event: any, clientId: any, data: any) => Promise<any>;
    }
  ) {
    this.getLogsUseCase = new GetProcessLogsUseCase(
      pm2ProcessRepo,
      serverRepo,
      sshClient,
      encryptionService
    );
    this.restartUseCase = new RestartProcessUseCase(
      pm2ProcessRepo,
      serverRepo,
      processActionRepo,
      sshClient,
      encryptionService
    );
  }

  async execute(input: DiagnoseAndHealInput): Promise<DiagnoseAndHealResult> {
    const process = await this.pm2ProcessRepo.findById(input.processId);
    if (!process) {
      throw new NotFoundError("Pm2Process", input.processId);
    }

    // Authorization
    const isClient =
      ("realm" in input.actor && input.actor.realm === "client") ||
      ("kind" in input.actor &&
        (input.actor.kind === "client_user" ||
          input.actor.kind === "api_key" ||
          input.actor.kind === "embed"));

    if (isClient) {
      const actorClientId =
        "clientId" in input.actor && input.actor.clientId ? input.actor.clientId : null;

      if (!actorClientId || process.clientId !== actorClientId) {
        throw new ForbiddenError("You do not have permission to inspect this process");
      }
    }

    // 1. Fetch recent stdout/stderr logs
    let logs = "";
    try {
      logs = await this.getLogsUseCase.execute({
        processId: input.processId,
        actor: input.actor,
        options: { lines: 60, timeoutMs: 8000 },
      });
    } catch (err: any) {
      logs = `Could not retrieve live logs: ${err.message}`;
    }

    // 2. Run diagnostic evaluation
    const diagnostic = FleetDiagnosticsService.diagnose(
      {
        id: process.id,
        pm2Id: process.pm2Id,
        name: process.name,
        status: process.status,
        restarts: process.restarts,
        uptimeMs: process.uptimeMs,
        cpu: process.cpu,
        memory: process.memory,
      },
      logs
    );

    let healAttempted = false;
    let healSuccess = false;
    let healMessage: string | undefined;
    let ticketCreatedId: string | undefined;
    let ticketSkippedCooldown = false;

    // 3. Autonomous Healing Action
    if (input.autoHeal && diagnostic.recoveryAction === "AUTO_RESTART_ELIGIBLE") {
      healAttempted = true;
      try {
        const restartRes = await this.restartUseCase.execute({
          processId: process.id,
          actor: input.actor,
          options: { timeoutMs: 12000 },
        });
        healSuccess = restartRes.success;
        healMessage = restartRes.message;
      } catch (restartErr: any) {
        healSuccess = false;
        healMessage = `Automated restart failed: ${restartErr.message}`;
      }
    }

    // Resolve server details for notifications & ticket
    const server = await this.serverRepo.findById(process.serverId);
    const serverHost = server?.host || "unknown-host";
    const now = Date.now();

    // 4. Autonomous Synergy: If auto-healed successfully, emit fleet.auto_healed
    if (healSuccess) {
      const healedData = {
        processId: process.id,
        processName: process.name,
        serverId: process.serverId,
        serverHost,
        restarts: process.restarts,
        action: "restart",
        healedAt: now,
      };

      try {
        getRealtimeHub().publish("fleet:events", {
          id: newId("evt"),
          topic: "fleet:events",
          type: "fleet.auto_healed",
          clientId: process.clientId,
          payload: healedData,
          timestamp: now,
        });
      } catch {}

      try {
        const dispatcher = this.webhookDispatcher ?? getWebhookDispatcher();
        await dispatcher.dispatch("fleet.auto_healed", process.clientId, healedData);
      } catch {}
    }

    // 5. Persistent crash evaluation
    // Crash loop or persistent crash (OOM, DB connection failure that couldn't be healed, unhandled exception, or CRITICAL)
    const isPersistentCrash =
      diagnostic.isCrashLoop ||
      diagnostic.category === "OUT_OF_MEMORY" ||
      (!healSuccess &&
        (diagnostic.category === "DATABASE_CONNECTION_FAILURE" ||
          diagnostic.category === "UNCAUGHT_EXCEPTION" ||
          diagnostic.severity === "CRITICAL"));

    if (isPersistentCrash) {
      const crashData = {
        processId: process.id,
        processName: process.name,
        serverId: process.serverId,
        serverHost,
        restarts: process.restarts,
        uptimeMs: process.uptimeMs,
        errorSignature: diagnostic.extractedError || diagnostic.title,
        category: diagnostic.category,
        recommendation: diagnostic.recommendation,
        crashedAt: now,
      };

      // Emit realtime hub event and outbound webhook
      try {
        getRealtimeHub().publish("fleet:events", {
          id: newId("evt"),
          topic: "fleet:events",
          type: "fleet.process_crashed",
          clientId: process.clientId,
          payload: crashData,
          timestamp: now,
        });
      } catch {}

      try {
        const dispatcher = this.webhookDispatcher ?? getWebhookDispatcher();
        await dispatcher.dispatch("fleet.process_crashed", process.clientId, crashData);
      } catch {}

      // Deduplication / Cooldown logic (30 minutes default)
      if (process.clientId) {
        const cooldownMs = input.cooldownMs ?? 30 * 60 * 1000;
        const lastTicketAt = DiagnoseAndHealProcessUseCase.ticketCooldowns.get(process.id);

        if (lastTicketAt && now - lastTicketAt < cooldownMs) {
          ticketSkippedCooldown = true;
        } else {
          // Record cooldown timestamp
          DiagnoseAndHealProcessUseCase.ticketCooldowns.set(process.id, now);
          const cooldownBucket = Math.floor(now / cooldownMs);
          const linkedIncidentId = `inc_fleet_${process.id}_${cooldownBucket}`;

          const ticketSubject = `[AUTONOMOUS INCIDENT] Process ${process.name} crashing on ${serverHost}`;
          const ticketBody = `### Autonomous Incident Diagnostic Report
**Process**: ${process.name} (#${process.pm2Id})
**Server Host**: ${serverHost}
**Status**: ${diagnostic.status}
**Uptime**: ${Math.round((process.uptimeMs || 0) / 1000)}s
**Restart Count**: ${process.restarts}
**Severity**: ${diagnostic.severity}
**Failure Category**: ${diagnostic.category}

#### Error Signature & Stack Trace
\`\`\`
${diagnostic.extractedError || `${diagnostic.title}: ${diagnostic.summary}`}
\`\`\`

#### Recommended Remediation
${diagnostic.recommendation}

*Automatically reported by RapidShift Autonomous Control Plane.*`;

          if (this.createTicketUseCase) {
            try {
              const ticketRes = await this.createTicketUseCase.execute(
                {
                  clientId: process.clientId,
                  subject: ticketSubject,
                  message: ticketBody,
                  priority: "P1",
                  category: "outage",
                  source: "system",
                  linkedProcessId: process.id,
                  linkedIncidentId,
                },
                SYSTEM_ACTOR("autonomous-fleet")
              );
              ticketCreatedId = ticketRes.ticket.id;
            } catch (ticketErr) {
              console.warn("[FleetDiagnostics] Failed to auto-create incident ticket via use case:", ticketErr);
            }
          } else if (input.createSupportTicketOnFailure) {
            try {
              const ticketRes = await input.createSupportTicketOnFailure({
                clientId: process.clientId,
                subject: ticketSubject,
                message: ticketBody,
                priority: "P1",
                linkedProcessId: process.id,
                linkedIncidentId,
              });

              if (ticketRes?.ticketId) {
                ticketCreatedId = ticketRes.ticketId;
              }
            } catch (ticketErr) {
              console.warn("[FleetDiagnostics] Failed to auto-create incident ticket via callback:", ticketErr);
            }
          }
        }
      }
    }

    return {
      diagnostic,
      healAttempted,
      healSuccess,
      healMessage,
      ticketCreatedId,
      ticketSkippedCooldown,
    };
  }
}
