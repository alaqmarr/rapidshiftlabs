import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases, getDb } from "../src/shared/infrastructure/db";
import { servers } from "../src/shared/infrastructure/db/schema/fleet";
import { eq } from "drizzle-orm";
import {
  FleetModule,
  getFleetModule,
  FleetCommandSanitizer,
  CommandSanitizationError,
  Pm2Parser,
  NodeSsh2Adapter,
} from "../src/modules/fleet";
import { ForbiddenError, RateLimitError } from "../src/shared/kernel/errors";
import { MockSshClient } from "./helpers/mock-ssh-client";
import { EmulatedSshServer } from "./helpers/emulated-ssh-server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.MASTER_KEY = testMasterKey;
process.env.AUTH_SECRET = "test-auth-secret-123456789";

describe("Fleet Bounded Context (Milestones 1, 2, and 3)", () => {
  const testDataDir = path.join(__dirname, "temp_fleet_test");
  const coreDbPath = path.join(testDataDir, "core.db");

  let mockSshClient: MockSshClient;
  let fleetModule: FleetModule;

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    process.env.DATA_DIR = testDataDir;

    setConfigForTests({
      dataDir: testDataDir,
      MASTER_KEY: testMasterKey,
      AUTH_SECRET: "test-auth-secret-123456789",
      dbPaths: {
        core: coreDbPath,
        analytics: path.join(testDataDir, "analytics.db"),
        metrics: path.join(testDataDir, "metrics.db"),
      },
    });

    const client = createClient({ url: `file:${coreDbPath}` });
    await client.execute("PRAGMA journal_mode = WAL;");
    await client.execute("PRAGMA synchronous = NORMAL;");
    await client.execute("PRAGMA busy_timeout = 5000;");

    await client.execute(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        username TEXT NOT NULL DEFAULT 'ubuntu',
        encrypted_private_key TEXT NOT NULL,
        key_passphrase_enc TEXT,
        host_fingerprint TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        last_checked_at INTEGER,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS pm2_processes (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        pm2_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        client_id TEXT,
        allow_client_restart INTEGER NOT NULL DEFAULT 0,
        restart_cooldown_sec INTEGER NOT NULL DEFAULT 60,
        status TEXT NOT NULL DEFAULT 'stopped',
        cpu INTEGER NOT NULL DEFAULT 0,
        memory INTEGER NOT NULL DEFAULT 0,
        restarts INTEGER NOT NULL DEFAULT 0,
        uptime_ms INTEGER DEFAULT 0,
        last_discovered_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pm2_processes_server_pm2id ON pm2_processes (server_id, pm2_id);
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS process_actions (
        id TEXT PRIMARY KEY,
        process_id TEXT NOT NULL,
        client_id TEXT,
        action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        triggered_by TEXT NOT NULL,
        output_excerpt TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    client.close();

    mockSshClient = new MockSshClient();
    fleetModule = getFleetModule({ sshClient: mockSshClient });
  });

  afterAll(() => {
    closeAllDatabases();
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe("Milestone 1: Server Registry & Secure Vault", () => {
    it("stores SSH private key encrypted at rest without exposing plaintext", async () => {
      const rawPrivateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn\n-----END OPENSSH PRIVATE KEY-----";

      const serverDTO = await fleetModule.registerServer({
        name: "Production Worker 01",
        host: "192.168.1.100",
        port: 22,
        username: "ubuntu",
        privateKey: rawPrivateKey,
        hostFingerprint: "SHA256:d41d8cd98f00b204e9800998ecf8427e",
      });

      expect(serverDTO.id).toMatch(/^srv_/);
      expect(serverDTO.name).toBe("Production Worker 01");
      expect(serverDTO.host).toBe("192.168.1.100");
      expect((serverDTO as any).encryptedPrivateKey).toBeUndefined();
      expect((serverDTO as any).privateKey).toBeUndefined();

      // Inspect raw database row directly
      const db = getDb("core");
      const rows = await db.select().from(servers).where(eq(servers.id, serverDTO.id));
      expect(rows).toHaveLength(1);

      const rawRow = rows[0]!;
      expect(rawRow.encryptedPrivateKey).toBeDefined();

      // Must be serialized as iv:tag:ciphertext (3 base64 chunks separated by colons)
      const parts = rawRow.encryptedPrivateKey.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]!.length).toBeGreaterThan(0);
      expect(parts[1]!.length).toBeGreaterThan(0);
      expect(parts[2]!.length).toBeGreaterThan(0);

      // Verify zero plaintext strings in the row
      expect(rawRow.encryptedPrivateKey).not.toContain("BEGIN OPENSSH PRIVATE KEY");
      expect(rawRow.encryptedPrivateKey).not.toContain("b3BlbnNzaC1rZXk");
      expect(JSON.stringify(rawRow)).not.toContain("BEGIN OPENSSH PRIVATE KEY");
    });

    it("retrieves and lists registered servers", async () => {
      const serverDTO = await fleetModule.registerServer({
        name: "Staging Web 01",
        host: "10.0.0.5",
        privateKey: "my-fake-secret-key-12345",
      });

      const fetched = await fleetModule.getServer(serverDTO.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(serverDTO.id);
      expect(fetched?.name).toBe("Staging Web 01");

      const all = await fleetModule.listServers();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.some((s) => s.id === serverDTO.id)).toBe(true);
    });
  });

  describe("Milestone 2: PM2 Process Discovery & Mapping", () => {
    it("parses noisy PM2 output with daemon banners and ANSI sequences", () => {
      const noisyOutput = `
\u001b[32m[PM2]\u001b[39m Spawning PM2 daemon with pm2_home=/home/ubuntu/.pm2
[PM2] PM2 Successfully daemonized
[
  {
    "pid": 5432,
    "name": "api-service",
    "pm_id": 0,
    "monit": {
      "memory": 85000000,
      "cpu": 3.4
    },
    "pm2_env": {
      "status": "online",
      "restart_time": 5,
      "pm_uptime": ${Date.now() - 7200000}
    }
  }
]
`;

      const parsed = Pm2Parser.parseJlist(noisyOutput);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.pmId).toBe(0);
      expect(parsed[0]?.name).toBe("api-service");
      expect(parsed[0]?.status).toBe("online");
      expect(parsed[0]?.cpu).toBe(3);
      expect(parsed[0]?.memory).toBe(85000000);
      expect(parsed[0]?.restarts).toBe(5);
    });

    it("discovers processes and persists them to the database", async () => {
      const server = await fleetModule.registerServer({
        name: "App Cluster 01",
        host: "10.10.10.1",
        privateKey: "secret-key-material",
      });

      const discovered = await fleetModule.discoverProcesses(server.id);
      expect(discovered).toHaveLength(2);
      expect(discovered[0]?.name).toBe("portal-api");
      expect(discovered[0]?.pm2Id).toBe(0);
      expect(discovered[1]?.name).toBe("background-worker");
      expect(discovered[1]?.pm2Id).toBe(1);

      // Verify updated server status
      const updatedServer = await fleetModule.getServer(server.id);
      expect(updatedServer?.status).toBe("online");
    });

    it("preserves client mapping and permissions on subsequent discovery runs", async () => {
      const server = await fleetModule.registerServer({
        name: "App Cluster 02",
        host: "10.10.10.2",
        privateKey: "secret-key-material-2",
      });

      const initial = await fleetModule.discoverProcesses(server.id);
      const targetProcess = initial[0]!;

      // Map to Client A
      const mapped = await fleetModule.mapProcessToClient({
        processId: targetProcess.id,
        clientId: "cli_clientA",
        allowClientRestart: true,
        restartCooldownSec: 45,
      });

      expect(mapped.clientId).toBe("cli_clientA");
      expect(mapped.allowClientRestart).toBe(true);
      expect(mapped.restartCooldownSec).toBe(45);

      // Run discovery again
      const reDiscovered = await fleetModule.discoverProcesses(server.id);
      const reTarget = reDiscovered.find((p) => p.id === targetProcess.id)!;

      // Assert administrative mappings were NOT wiped out
      expect(reTarget.clientId).toBe("cli_clientA");
      expect(reTarget.allowClientRestart).toBe(true);
      expect(reTarget.restartCooldownSec).toBe(45);
    });
  });

  describe("Milestone 3: Client Actions, Authorization & Security", () => {
    let serverId: string;
    let processAId: string;
    let processBId: string;

    beforeAll(async () => {
      const server = await fleetModule.registerServer({
        name: "Security Test Server",
        host: "10.20.30.40",
        privateKey: "sec-key",
      });
      serverId = server.id;

      const procs = await fleetModule.discoverProcesses(serverId);
      processAId = procs[0]!.id;
      processBId = procs[1]!.id;

      // Process A -> Client A (restart enabled, 30s cooldown)
      await fleetModule.mapProcessToClient({
        processId: processAId,
        clientId: "cli_clientA",
        allowClientRestart: true,
        restartCooldownSec: 30,
      });

      // Process B -> Client B (restart disabled)
      await fleetModule.mapProcessToClient({
        processId: processBId,
        clientId: "cli_clientB",
        allowClientRestart: false,
        restartCooldownSec: 60,
      });
    });

    it("permits authorized client to restart their own process", async () => {
      const result = await fleetModule.restartProcess({
        processId: processAId,
        actor: { realm: "client", clientId: "cli_clientA", userId: "usr_clientA_1" },
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("restarted successfully");
      expect(result.actionId).toMatch(/^act_/);
    });

    it("rejects unauthorized client attempting to restart another client's process (403 Forbidden)", async () => {
      // Client B tries to restart Client A's process
      await expect(
        fleetModule.restartProcess({
          processId: processAId,
          actor: { realm: "client", clientId: "cli_clientB", userId: "usr_clientB_1" },
        })
      ).rejects.toThrowError(ForbiddenError);

      try {
        await fleetModule.restartProcess({
          processId: processAId,
          actor: { realm: "client", clientId: "cli_clientB", userId: "usr_clientB_1" },
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenError);
        expect(err.status).toBe(403);
      }
    });

    it("rejects restart when allowClientRestart is disabled (403 Forbidden)", async () => {
      // Client B tries to restart their own process B where allowClientRestart is false
      await expect(
        fleetModule.restartProcess({
          processId: processBId,
          actor: { realm: "client", clientId: "cli_clientB", userId: "usr_clientB_1" },
        })
      ).rejects.toThrowError(ForbiddenError);

      try {
        await fleetModule.restartProcess({
          processId: processBId,
          actor: { realm: "client", clientId: "cli_clientB", userId: "usr_clientB_1" },
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenError);
        expect(err.status).toBe(403);
      }
    });

    it("enforces restart cooldown timer (429 RateLimitError)", async () => {
      // Process A was restarted in previous test, which has 30s cooldown
      await expect(
        fleetModule.restartProcess({
          processId: processAId,
          actor: { realm: "client", clientId: "cli_clientA", userId: "usr_clientA_1" },
        })
      ).rejects.toThrowError(RateLimitError);

      try {
        await fleetModule.restartProcess({
          processId: processAId,
          actor: { realm: "client", clientId: "cli_clientA", userId: "usr_clientA_1" },
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect(err.status).toBe(429);
        expect(err.retryAfterSeconds).toBeGreaterThan(0);
        expect(err.retryAfterSeconds).toBeLessThanOrEqual(30);
      }
    });

    it("rejects unauthorized client attempting to view another client's logs (403 Forbidden)", async () => {
      await expect(
        fleetModule.getProcessLogs({
          processId: processAId,
          actor: { realm: "client", clientId: "cli_clientB", userId: "usr_clientB_1" },
        })
      ).rejects.toThrowError(ForbiddenError);
    });

    it("allows authorized client to view their own process logs", async () => {
      const logs = await fleetModule.getProcessLogs({
        processId: processAId,
        actor: { realm: "client", clientId: "cli_clientA", userId: "usr_clientA_1" },
        options: { lines: 50 },
      });

      expect(logs).toContain("Server listening on port 3000");
    });

    it("rejects command injection attempts with CommandSanitizationError", () => {
      const maliciousPm2Ids = [
        "1; rm -rf /",
        "1 | cat /etc/passwd",
        "1 && whoami",
        "1\nreboot",
        "$(whoami)",
        "`cat /etc/shadow`",
        "-1",
        "0x10",
        "NaN",
        "1.5",
        "abc",
        "",
      ];

      for (const badId of maliciousPm2Ids) {
        expect(() => FleetCommandSanitizer.buildRestartCommand(badId)).toThrowError(
          CommandSanitizationError
        );
      }

      const maliciousLines = [
        "100; rm -rf /",
        "100 | cat",
        "0",
        "-10",
        "1000000",
        "NaN",
      ];

      for (const badLine of maliciousLines) {
        expect(() => FleetCommandSanitizer.buildLogsCommand(1, badLine)).toThrowError(
          CommandSanitizationError
        );
      }

      // Assert allowlist regex rejection
      expect(() =>
        FleetCommandSanitizer.assertAllowlisted("pm2 restart 1; echo pwned")
      ).toThrowError(CommandSanitizationError);
      expect(() => FleetCommandSanitizer.assertAllowlisted("cat /etc/passwd")).toThrowError(
        CommandSanitizationError
      );
    });
  });

  describe("Integration: Emulated SSH Server Network Sanity Test", () => {
    let emulatedServer: EmulatedSshServer;
    let emulatedPort: number;
    let netFleetModule: FleetModule;

    beforeAll(async () => {
      emulatedServer = new EmulatedSshServer();
      emulatedPort = await emulatedServer.start();

      // Uses real NodeSsh2Adapter connecting over 127.0.0.1 TCP socket
      netFleetModule = getFleetModule({
        sshClient: new NodeSsh2Adapter(),
      });
    });

    afterAll(async () => {
      await netFleetModule.sshClient.disconnectAll();
      await emulatedServer.stop();
    });

    it("successfully connects over real SSH TCP connection and executes discovery", async () => {
      const serverDTO = await netFleetModule.registerServer({
        name: "Emulated VM",
        host: "127.0.0.1",
        port: emulatedPort,
        username: "ubuntu",
        privateKey: emulatedServer.privateKey,
      });

      const procs = await netFleetModule.discoverProcesses(serverDTO.id);
      expect(procs).toHaveLength(1);
      expect(procs[0]?.name).toBe("test-app");
      expect(procs[0]?.pm2Id).toBe(0);

      // Map and restart
      await netFleetModule.mapProcessToClient({
        processId: procs[0]!.id,
        clientId: "cli_emulated",
        allowClientRestart: true,
      });

      const restartRes = await netFleetModule.restartProcess({
        processId: procs[0]!.id,
        actor: { realm: "client", clientId: "cli_emulated", userId: "usr_emulated" },
      });
      expect(restartRes.success).toBe(true);

      const logs = await netFleetModule.getProcessLogs({
        processId: procs[0]!.id,
        actor: { realm: "client", clientId: "cli_emulated", userId: "usr_emulated" },
      });
      expect(logs).toContain("Log line 1");
    });
  });
});
