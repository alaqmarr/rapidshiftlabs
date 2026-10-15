import {
  DrizzleServerRepository,
  DrizzlePm2ProcessRepository,
  AesEncryptionService,
  NodeSsh2Adapter,
  FleetCommandSanitizer,
  Pm2Parser,
  type Server,
  type SshClientPort,
  type EncryptionService,
} from "@rsl/core/fleet";
import { uow } from "@rsl/core/db";
import { serverMetrics } from "@rsl/core/db";
import { newId } from "@rsl/core/kernel";

export interface MetricsPollerOptions {
  workerId: string;
  pollIntervalMs?: number; // default 30,000ms (30s)
  sshClient?: SshClientPort;
  encryptionService?: EncryptionService;
}

export interface TelemetryData {
  load1: number;
  cpuPercent: number;
  memTotalMb: number;
  memUsedMb: number;
  uptimeSeconds: number;
}

export function parseTelemetry(stdout: string): TelemetryData {
  let load1 = 0;
  let memTotalMb = 0;
  let memAvailableMb = 0;
  let memFreeMb = 0;
  let uptimeSeconds = 0;

  const lines = stdout.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check loadavg (starts with numbers, e.g. "0.15 0.20 0.25 1/200 1234")
    const loadMatch = trimmed.match(/^(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)/);
    if (loadMatch?.[1] && load1 === 0) {
      load1 = parseFloat(loadMatch[1]);
      continue;
    }

    // Check meminfo lines
    const memTotalMatch = trimmed.match(/^MemTotal:\s+(\d+)\s+kB/i);
    if (memTotalMatch?.[1]) {
      memTotalMb = Math.round(parseInt(memTotalMatch[1], 10) / 1024);
      continue;
    }

    const memAvailMatch = trimmed.match(/^MemAvailable:\s+(\d+)\s+kB/i);
    if (memAvailMatch?.[1]) {
      memAvailableMb = Math.round(parseInt(memAvailMatch[1], 10) / 1024);
      continue;
    }

    const memFreeMatch = trimmed.match(/^MemFree:\s+(\d+)\s+kB/i);
    if (memFreeMatch?.[1]) {
      memFreeMb = Math.round(parseInt(memFreeMatch[1], 10) / 1024);
      continue;
    }

    // Check uptime
    const uptimeMatch = trimmed.match(/^(\d+\.?\d*)\s+(\d+\.?\d*)$/);
    if (uptimeMatch?.[1]) {
      uptimeSeconds = Math.round(parseFloat(uptimeMatch[1]));
    }
  }

  const effectiveFree = memAvailableMb > 0 ? memAvailableMb : memFreeMb;
  const memUsedMb = Math.max(0, memTotalMb - effectiveFree);
  const cpuPercent = Math.min(100, Math.max(0, Math.round(load1 * 100)));

  return {
    load1,
    cpuPercent,
    memTotalMb,
    memUsedMb,
    uptimeSeconds,
  };
}

export class MetricsPollerJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly serverRepo: DrizzleServerRepository;
  private readonly pm2ProcessRepo: DrizzlePm2ProcessRepository;
  private readonly sshClient: SshClientPort;
  private readonly encryptionService: EncryptionService;
  // Track restarts per process: key = processId, value = { count: number, timestamp: number }
  private readonly restartHistory = new Map<string, { count: number; timestamp: number }>();

  constructor(private readonly options: MetricsPollerOptions) {
    this.serverRepo = new DrizzleServerRepository();
    this.pm2ProcessRepo = new DrizzlePm2ProcessRepository();
    this.sshClient = options.sshClient ?? new NodeSsh2Adapter();
    this.encryptionService = options.encryptionService ?? new AesEncryptionService();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs ?? 30_000;
    console.log(
      `[MetricsPollerJob] Started metrics poller daemon (interval: ${interval}ms)`,
    );
    void this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
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
          console.error("[MetricsPollerJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[MetricsPollerJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const servers = await this.serverRepo.listAll();
      const activeServers = servers.filter((s: Server) => s.status !== "offline");

      for (const server of activeServers) {
        if (!this.isRunning) break;
        try {
          await this.pollServer(server);
        } catch (serverErr: any) {
          console.error(
            `[MetricsPollerJob] Unhandled error polling server "${server.name}":`,
            serverErr?.message || serverErr,
          );
        }
      }
    } catch (err) {
      console.error("[MetricsPollerJob] Error during polling cycle:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 30_000);
    }
  }

  public async pollServer(server: Server): Promise<void> {
    try {
      const decryptedPrivateKey = this.encryptionService.decrypt(
        server.encryptedPrivateKey,
      );
      const decryptedPassphrase = server.keyPassphraseEnc
        ? this.encryptionService.decrypt(server.keyPassphraseEnc)
        : null;

      const creds = {
        serverId: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        decryptedPrivateKey,
        decryptedPassphrase,
        hostFingerprint: server.hostFingerprint,
      };

      // 1. Probe system metrics
      const probeCmd = FleetCommandSanitizer.buildMetricsProbeCommand();
      const probeResult = await this.sshClient.execute(creds, probeCmd);
      const telemetry = parseTelemetry(probeResult.stdout);

      // Record in metrics.db server_metrics
      await uow.runInTransaction("metrics", async (tx) => {
        await tx.insert(serverMetrics).values({
          id: newId("met"),
          serverId: server.id,
          cpuPercent: telemetry.cpuPercent,
          memoryUsedMb: telemetry.memUsedMb,
          timestamp: Date.now(),
        });
      });

      // 2. Probe PM2 processes
      const jlistCmd = FleetCommandSanitizer.buildJlistCommand();
      const jlistResult = await this.sshClient.execute(creds, jlistCmd);
      const parsedPm2 = Pm2Parser.parseJlist(jlistResult.stdout);

      // Sync into pm2_processes
      const syncedProcesses = await this.pm2ProcessRepo.syncDiscoveredProcesses(
        server.id,
        parsedPm2.map((p) => ({
          pm2Id: p.pmId,
          name: p.name,
          status: p.status,
          cpu: p.cpu,
          memory: p.memory,
          restarts: p.restarts,
          uptimeMs: p.uptimeMs,
        })),
      );

      // 3. Restart Surge Detection (>5 restarts in 60s)
      const now = Date.now();
      for (const proc of syncedProcesses) {
        const historyKey = `${server.id}:${proc.pm2Id}`;
        const prev = this.restartHistory.get(historyKey);

        if (prev && now - prev.timestamp <= 60_000) {
          const restartDelta = proc.restarts - prev.count;
          if (restartDelta > 5) {
            console.warn(
              `[MetricsPollerJob] SURGE DETECTED: Process "${proc.name}" (pm2_id: ${proc.pm2Id}) on server "${server.name}" restarted ${restartDelta} times in ${Math.round((now - prev.timestamp) / 1000)}s! Potential crash-loop!`,
            );
          }
        }
        this.restartHistory.set(historyKey, {
          count: proc.restarts,
          timestamp: now,
        });
      }

      // Update server health to online
      server.updateStatus("online");
      await this.serverRepo.save(server);
    } catch (err: any) {
      console.warn(
        `[MetricsPollerJob] Failed polling server "${server.name}" (${server.host}): ${err.message}`,
      );
      try {
        server.updateStatus("unreachable", err.message);
        await this.serverRepo.save(server);
      } catch (saveErr) {
        console.error(
          `[MetricsPollerJob] Could not save unreachable status for server "${server.name}":`,
          saveErr,
        );
      }
    }
  }
}

export function startMetricsPoller(
  options: MetricsPollerOptions,
): MetricsPollerJob {
  const job = new MetricsPollerJob(options);
  job.start();
  return job;
}
