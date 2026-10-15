import { describe, it, expect, beforeEach, vi } from "vitest";
import { DiagnoseAndHealProcessUseCase } from "../../../src/modules/fleet/application/use-cases/diagnose-and-heal-process.usecase";
import { Pm2Process } from "../../../src/modules/fleet/domain/entities/pm2-process.entity";
import { Server } from "../../../src/modules/fleet/domain/entities/server.entity";
import { SYSTEM_ACTOR } from "../../../src/shared/kernel/actor";

describe("Autonomous Fleet Crash -> Auto-Support Ticket (Pillar 1)", () => {
  let mockPm2Repo: any;
  let mockServerRepo: any;
  let mockProcessActionRepo: any;
  let mockSshClient: any;
  let mockEncryptionService: any;
  let mockCreateTicketUseCase: any;
  let mockWebhookDispatcher: any;
  let useCase: DiagnoseAndHealProcessUseCase;

  const sampleServer = Server.reconstitute({
    id: "srv_prod_01",
    name: "Production App Node 1",
    host: "10.0.1.50",
    port: 22,
    username: "ubuntu",
    encryptedPrivateKey: "enc_key",
    keyPassphraseEnc: null,
    hostFingerprint: null,
    status: "online",
    lastCheckedAt: new Date(),
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    DiagnoseAndHealProcessUseCase.clearCooldowns();

    mockServerRepo = {
      findById: vi.fn().mockResolvedValue(sampleServer),
    };

    mockProcessActionRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findLastSuccessfulRestart: vi.fn().mockResolvedValue(null),
    };

    mockEncryptionService = {
      decrypt: vi.fn().mockReturnValue("decrypted_key"),
      encrypt: vi.fn().mockReturnValue("encrypted_key"),
    };

    mockSshClient = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: "Logs retrieved successfully",
        stderr: "",
      }),
    };

    mockCreateTicketUseCase = {
      execute: vi.fn().mockImplementation(async (input: any) => {
        return {
          ticket: {
            id: "tkt_auto_999",
            number: "TKT-123456",
            clientId: input.clientId,
            subject: input.subject,
            priority: input.priority,
            linkedIncidentId: input.linkedIncidentId,
            linkedProcessId: input.linkedProcessId,
          },
          message: {
            id: "msg_auto_111",
            body: input.message,
          },
        };
      }),
    };

    mockWebhookDispatcher = {
      dispatch: vi.fn().mockResolvedValue([]),
    };
  });

  it("automatically creates an internal P1 ticket on persistent OOM crash with exact subject and diagnostics in body", async () => {
    const oomProcess = Pm2Process.reconstitute({
      id: "proc_worker",
      serverId: "srv_prod_01",
      pm2Id: 4,
      name: "order-processor",
      clientId: "cli_acme_corp",
      allowClientRestart: true,
      restartCooldownSec: 60,
      status: "errored",
      cpu: 0,
      memory: 2147483648,
      restarts: 5,
      uptimeMs: 12000,
      lastDiscoveredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPm2Repo = {
      findById: vi.fn().mockResolvedValue(oomProcess),
    };

    mockSshClient.execute = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: `
[2026-10-12 12:00:00] Initializing processing queue...
[2026-10-12 12:01:10] FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
at Array.push (<anonymous>)
at processOrderBatch (/app/worker.js:142:15)
      `,
      stderr: "",
    });

    useCase = new DiagnoseAndHealProcessUseCase(
      mockPm2Repo,
      mockServerRepo,
      mockProcessActionRepo,
      mockSshClient,
      mockEncryptionService,
      mockCreateTicketUseCase,
      mockWebhookDispatcher
    );

    const result = await useCase.execute({
      processId: "proc_worker",
      actor: SYSTEM_ACTOR("autonomous-engine"),
      autoHeal: true,
    });

    // Verify diagnostic
    expect(result.diagnostic.severity).toBe("CRITICAL");
    expect(result.diagnostic.category).toBe("OUT_OF_MEMORY");
    expect(result.ticketCreatedId).toBe("tkt_auto_999");
    expect(result.ticketSkippedCooldown).toBeFalsy();

    // Verify ticket creation call
    expect(mockCreateTicketUseCase.execute).toHaveBeenCalledTimes(1);
    const [ticketInput, ticketActor] = mockCreateTicketUseCase.execute.mock.calls[0];

    // Verify actor
    expect(ticketActor.kind).toBe("system");
    expect(ticketActor.name).toBe("autonomous-fleet");

    // Verify subject format: [AUTONOMOUS INCIDENT] Process ${processName} crashing on ${serverHost}
    expect(ticketInput.subject).toBe("[AUTONOMOUS INCIDENT] Process order-processor crashing on 10.0.1.50");
    expect(ticketInput.priority).toBe("P1");
    expect(ticketInput.clientId).toBe("cli_acme_corp");
    expect(ticketInput.linkedProcessId).toBe("proc_worker");
    expect(ticketInput.linkedIncidentId).toContain("inc_fleet_proc_worker");

    // Verify body content
    expect(ticketInput.message).toContain("### Autonomous Incident Diagnostic Report");
    expect(ticketInput.message).toContain("**Process**: order-processor (#4)");
    expect(ticketInput.message).toContain("**Server Host**: 10.0.1.50");
    expect(ticketInput.message).toContain("**Restart Count**: 5");
    expect(ticketInput.message).toContain("JavaScript heap out of memory");
    expect(ticketInput.message).toContain("--max-old-space-size");

    // Verify outbound webhook was dispatched for fleet.process_crashed
    expect(mockWebhookDispatcher.dispatch).toHaveBeenCalledWith(
      "fleet.process_crashed",
      "cli_acme_corp",
      expect.objectContaining({
        processId: "proc_worker",
        processName: "order-processor",
        serverHost: "10.0.1.50",
        category: "OUT_OF_MEMORY",
      })
    );
  });

  it("automatically creates a P1 ticket when PM2 process is detected in a crash loop", async () => {
    const loopProcess = Pm2Process.reconstitute({
      id: "proc_looping",
      serverId: "srv_prod_01",
      pm2Id: 7,
      name: "auth-gateway",
      clientId: "cli_acme_corp",
      allowClientRestart: true,
      restartCooldownSec: 60,
      status: "errored",
      cpu: 0,
      memory: 120000000,
      restarts: 12,
      uptimeMs: 8000,
      lastDiscoveredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPm2Repo = {
      findById: vi.fn().mockResolvedValue(loopProcess),
    };

    mockSshClient.execute = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "Error: Cannot find module './missing-config.json'",
      stderr: "",
    });

    useCase = new DiagnoseAndHealProcessUseCase(
      mockPm2Repo,
      mockServerRepo,
      mockProcessActionRepo,
      mockSshClient,
      mockEncryptionService,
      mockCreateTicketUseCase,
      mockWebhookDispatcher
    );

    const result = await useCase.execute({
      processId: "proc_looping",
      actor: SYSTEM_ACTOR("autonomous-engine"),
      autoHeal: true,
    });

    expect(result.diagnostic.isCrashLoop).toBe(true);
    expect(result.diagnostic.severity).toBe("CRITICAL");
    expect(result.ticketCreatedId).toBe("tkt_auto_999");
    expect(mockCreateTicketUseCase.execute).toHaveBeenCalledTimes(1);

    const [ticketInput] = mockCreateTicketUseCase.execute.mock.calls[0];
    expect(ticketInput.subject).toBe("[AUTONOMOUS INCIDENT] Process auth-gateway crashing on 10.0.1.50");
    expect(ticketInput.priority).toBe("P1");
  });

  it("enforces 30-minute deduplication cooldown to prevent spamming duplicate tickets for the same process", async () => {
    const crashingProcess = Pm2Process.reconstitute({
      id: "proc_repetitive",
      serverId: "srv_prod_01",
      pm2Id: 2,
      name: "billing-cron",
      clientId: "cli_acme_corp",
      allowClientRestart: true,
      restartCooldownSec: 60,
      status: "errored",
      cpu: 0,
      memory: 150000000,
      restarts: 6,
      uptimeMs: 5000,
      lastDiscoveredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPm2Repo = {
      findById: vi.fn().mockResolvedValue(crashingProcess),
    };

    mockSshClient.execute = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "TypeError: Cannot read properties of undefined (reading 'token')",
      stderr: "",
    });

    useCase = new DiagnoseAndHealProcessUseCase(
      mockPm2Repo,
      mockServerRepo,
      mockProcessActionRepo,
      mockSshClient,
      mockEncryptionService,
      mockCreateTicketUseCase,
      mockWebhookDispatcher
    );

    // First diagnosis -> Creates ticket #1
    const firstResult = await useCase.execute({
      processId: "proc_repetitive",
      actor: SYSTEM_ACTOR("test"),
      autoHeal: false,
    });

    expect(firstResult.ticketCreatedId).toBe("tkt_auto_999");
    expect(firstResult.ticketSkippedCooldown).toBeFalsy();
    expect(mockCreateTicketUseCase.execute).toHaveBeenCalledTimes(1);

    // Second diagnosis immediately after (within 30 mins) -> Cooldown suppresses ticket creation!
    const secondResult = await useCase.execute({
      processId: "proc_repetitive",
      actor: SYSTEM_ACTOR("test"),
      autoHeal: false,
    });

    expect(secondResult.ticketCreatedId).toBeUndefined();
    expect(secondResult.ticketSkippedCooldown).toBe(true);
    // Ticket creation count remains 1
    expect(mockCreateTicketUseCase.execute).toHaveBeenCalledTimes(1);

    // If cooldown is cleared or 30 minutes expire:
    DiagnoseAndHealProcessUseCase.clearCooldowns();

    const thirdResult = await useCase.execute({
      processId: "proc_repetitive",
      actor: SYSTEM_ACTOR("test"),
      autoHeal: false,
    });

    expect(thirdResult.ticketCreatedId).toBe("tkt_auto_999");
    expect(thirdResult.ticketSkippedCooldown).toBeFalsy();
    expect(mockCreateTicketUseCase.execute).toHaveBeenCalledTimes(2);
  });

  it("does not create an incident ticket if auto-heal successfully recovers the process, but dispatches fleet.auto_healed", async () => {
    const recoverableProcess = Pm2Process.reconstitute({
      id: "proc_recoverable",
      serverId: "srv_prod_01",
      pm2Id: 8,
      name: "api-gateway",
      clientId: "cli_acme_corp",
      allowClientRestart: true,
      restartCooldownSec: 60,
      status: "errored",
      cpu: 0,
      memory: 150000000,
      restarts: 1, // Eligible for auto-restart
      uptimeMs: 30000,
      lastDiscoveredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPm2Repo = {
      findById: vi.fn().mockResolvedValue(recoverableProcess),
      save: vi.fn().mockResolvedValue(undefined),
    };

    // SSH logs show transient database glitch
    mockSshClient.execute = vi.fn().mockImplementation(async (_creds: any, cmd: string) => {
      if (cmd.includes("logs")) {
        return {
          exitCode: 0,
          stdout: "Error: connect ECONNREFUSED 10.0.0.12:5432",
          stderr: "",
        };
      }
      if (cmd.includes("restart")) {
        return {
          exitCode: 0,
          stdout: "PM2 Successfully restarted process api-gateway",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    useCase = new DiagnoseAndHealProcessUseCase(
      mockPm2Repo,
      mockServerRepo,
      mockProcessActionRepo,
      mockSshClient,
      mockEncryptionService,
      mockCreateTicketUseCase,
      mockWebhookDispatcher
    );

    const result = await useCase.execute({
      processId: "proc_recoverable",
      actor: SYSTEM_ACTOR("test"),
      autoHeal: true,
    });

    expect(result.healAttempted).toBe(true);
    expect(result.healSuccess).toBe(true);
    // Since auto-heal resolved the issue, no incident ticket is needed!
    expect(result.ticketCreatedId).toBeUndefined();
    expect(mockCreateTicketUseCase.execute).not.toHaveBeenCalled();

    // Outbound webhook fleet.auto_healed is dispatched
    expect(mockWebhookDispatcher.dispatch).toHaveBeenCalledWith(
      "fleet.auto_healed",
      "cli_acme_corp",
      expect.objectContaining({
        processId: "proc_recoverable",
        processName: "api-gateway",
        serverHost: "10.0.1.50",
      })
    );
  });

  it("does not create a support ticket if process is not mapped to any client", async () => {
    const unmappedProcess = Pm2Process.reconstitute({
      id: "proc_unmapped",
      serverId: "srv_prod_01",
      pm2Id: 9,
      name: "system-internal-daemon",
      clientId: null, // No client mapped
      allowClientRestart: false,
      restartCooldownSec: 60,
      status: "errored",
      cpu: 0,
      memory: 150000000,
      restarts: 10,
      uptimeMs: 2000,
      lastDiscoveredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPm2Repo = {
      findById: vi.fn().mockResolvedValue(unmappedProcess),
    };

    mockSshClient.execute = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "FATAL ERROR: JavaScript heap out of memory",
      stderr: "",
    });

    useCase = new DiagnoseAndHealProcessUseCase(
      mockPm2Repo,
      mockServerRepo,
      mockProcessActionRepo,
      mockSshClient,
      mockEncryptionService,
      mockCreateTicketUseCase,
      mockWebhookDispatcher
    );

    const result = await useCase.execute({
      processId: "proc_unmapped",
      actor: SYSTEM_ACTOR("test"),
      autoHeal: false,
    });

    expect(result.diagnostic.category).toBe("OUT_OF_MEMORY");
    // Cannot create client support ticket without client mapping
    expect(result.ticketCreatedId).toBeUndefined();
    expect(mockCreateTicketUseCase.execute).not.toHaveBeenCalled();
  });
});
