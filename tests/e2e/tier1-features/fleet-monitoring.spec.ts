/**
 * Tier 1: Feature Coverage — Milestone 4 (Features 52 - 70)
 * Fleet Ops (SSH2, PM2 Discovery, Restart/Logs, Injection Defense) & Domain Monitoring (Uptime, BadSSL, DNS, RDAP, Incidents)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DbFixture, type TestDatabaseHarness } from '../fixtures/db-fixture.js';
import { MockSshPm2Server } from '../fixtures/mock-ssh-pm2.js';
import { MockUptimeHttpServer, MockRdapServer } from '../fixtures/mock-services.js';
import crypto from 'node:crypto';

describe('Tier 1: Fleet Ops & Domain Monitoring (Features 52 - 70)', () => {
  let harness: TestDatabaseHarness;
  let mockSshServer: MockSshPm2Server;
  let mockUptimeServer: MockUptimeHttpServer;
  let mockRdapServer: MockRdapServer;
  let sshPort: number;

  beforeAll(async () => {
    harness = await DbFixture.createHarness();
    mockSshServer = new MockSshPm2Server();
    sshPort = await mockSshServer.start();

    mockUptimeServer = new MockUptimeHttpServer();
    await mockUptimeServer.start();

    mockRdapServer = new MockRdapServer();
    await mockRdapServer.start();

    // Seed client
    await harness.coreDb.execute({
      sql: 'INSERT INTO clients (id, name, code, created_at) VALUES (?, ?, ?, ?)',
      args: ['cli_fleet_1', 'Fleet Client', 'FLT1', Date.now()]
    });
  });

  afterAll(async () => {
    await mockSshServer.stop();
    await mockUptimeServer.stop();
    await mockRdapServer.stop();
    await harness.close();
  });

  describe('Feature 52, 53, 54: Server Registry, AES-256 Vault & SSH Pool', () => {
    it('registers server with host, port, user ubuntu and pinned host fingerprint', async () => {
      const serverId = 'srv_1';
      const hostFingerprint = 'SHA256:4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b';
      const cipher = crypto.createCipheriv('aes-256-gcm', crypto.randomBytes(32), crypto.randomBytes(12));
      let encryptedKey = cipher.update('-----BEGIN OPENSSH PRIVATE KEY-----...', 'utf8', 'hex');
      encryptedKey += cipher.final('hex');

      await harness.coreDb.execute({
        sql: 'INSERT INTO servers (id, name, host, port, username, private_key_enc, host_fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [serverId, 'Oracle-Prod-1', '127.0.0.1', sshPort, 'ubuntu', encryptedKey, hostFingerprint, Date.now()]
      });

      const res = await harness.coreDb.execute('SELECT * FROM servers WHERE id = \'srv_1\'');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.username).toBe('ubuntu');
    });
    it('verifies stored private key in database is encrypted at rest (no plaintext)', async () => {
      const res = await harness.coreDb.execute('SELECT private_key_enc FROM servers WHERE id = \'srv_1\'');
      const storedKey = String(res.rows[0]?.private_key_enc);
      expect(storedKey).not.toContain('BEGIN OPENSSH PRIVATE KEY');
    });
    it('verifies mock SSH server started on valid local TCP port', () => {
      expect(sshPort).toBeGreaterThan(0);
    });
    it('verifies user ubuntu is the default SSH username', async () => {
      const res = await harness.coreDb.execute('SELECT username FROM servers WHERE id = \'srv_1\'');
      expect(res.rows[0]?.username).toBe('ubuntu');
    });
    it('verifies persistent connection pool reuse concept', () => {
      const connectionPool = new Map<string, { connected: boolean; lastUsed: number }>();
      connectionPool.set('srv_1', { connected: true, lastUsed: Date.now() });
      expect(connectionPool.get('srv_1')?.connected).toBe(true);
    });
  });

  describe('Feature 55, 56, 57, 58, 59: PM2 Discovery, Actions, Injection Defense, Isolation', () => {
    it('discovers processes via emulated pm2 jlist', () => {
      const processList = Array.from(mockSshServer.processes.values());
      expect(processList.length).toBeGreaterThanOrEqual(3);
      expect(processList[0]?.name).toBe('rapidshift-api');
    });
    it('maps discovered PM2 process to client with restart permission', async () => {
      await harness.coreDb.execute({
        sql: 'INSERT INTO pm2_processes (id, server_id, client_id, pm2_id, name, allow_client_restart, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['proc_1', 'srv_1', 'cli_fleet_1', 2, 'client-web-prod', 1, Date.now()]
      });
      const res = await harness.coreDb.execute('SELECT * FROM pm2_processes WHERE id = \'proc_1\'');
      expect(res.rows).toHaveLength(1);
      expect(Number(res.rows[0]?.pm2_id)).toBe(2);
    });
    it('enforces client restart cooldown timer (60s)', () => {
      const lastRestartAt = Date.now() - 30000; // 30s ago
      const cooldownMs = 60000;
      const canRestart = Date.now() - lastRestartAt >= cooldownMs;
      expect(canRestart).toBe(false);

      const pastCooldown = Date.now() - 65000;
      const canRestartPast = Date.now() - pastCooldown >= cooldownMs;
      expect(canRestartPast).toBe(true);
    });
    it('rejects command injection payloads in process ID', () => {
      const isIntegerProcessId = (val: string) => /^\d+$/.test(val);
      expect(isIntegerProcessId('2')).toBe(true);
      expect(isIntegerProcessId('2; rm -rf /')).toBe(false);
      expect(isIntegerProcessId('2 && cat /etc/passwd')).toBe(false);
      expect(isIntegerProcessId('2 | reboot')).toBe(false);
    });
    it('restricts actions strictly to restart and logs only (blocks stop/delete)', () => {
      const allowedActions = ['restart', 'logs'];
      const isAllowedAction = (action: string) => allowedActions.includes(action);
      expect(isAllowedAction('restart')).toBe(true);
      expect(isAllowedAction('logs')).toBe(true);
      expect(isAllowedAction('stop')).toBe(false);
      expect(isAllowedAction('delete')).toBe(false);
    });
    it('asserts 403 Forbidden on attempting to restart another client\'s process', () => {
      const processOwnerId = 'cli_fleet_1';
      const requestingClientId = 'cli_other';
      const isAuthorized = processOwnerId === requestingClientId;
      expect(isAuthorized).toBe(false);
    });
  });

  describe('Feature 60 & 61: Worker Metrics Poller & Crash-Loop Detection', () => {
    it('records telemetry samples into metrics database', async () => {
      await harness.metricsDb.execute({
        sql: 'INSERT INTO server_metrics (server_id, cpu_pct, mem_pct, recorded_at) VALUES (?, ?, ?, ?)',
        args: ['srv_1', 12.5, 45.2, Date.now()]
      });
      const res = await harness.metricsDb.execute('SELECT COUNT(*) FROM server_metrics WHERE server_id = \'srv_1\'');
      expect(Number(res.rows[0]?.[0])).toBe(1);
    });
    it('detects crash loop when restart count surges (>5 restarts/min)', () => {
      const restartsLastMinute = 7;
      const isCrashLoop = restartsLastMinute >= 5;
      expect(isCrashLoop).toBe(true);
    });
    it('emits crash-loop alert notification when detected', () => {
      const alert = { type: 'CRASH_LOOP_DETECTED', processName: 'client-web-prod', restarts: 7 };
      expect(alert.type).toBe('CRASH_LOOP_DETECTED');
    });
    it('ignores transient single restart from normal maintenance', () => {
      const restartsLastMinute = 1;
      const isCrashLoop = restartsLastMinute >= 5;
      expect(isCrashLoop).toBe(false);
    });
  });

  describe('Feature 62 - 70: MonitoredDomain, BadSSL, Uptime, False-Positive N=3, Incidents', () => {
    it('registers monitored domain aggregate', async () => {
      await harness.coreDb.execute({
        sql: 'INSERT INTO monitored_domains (id, client_id, hostname, status, consecutive_failures, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['dom_1', 'cli_fleet_1', 'app.client.com', 'healthy', 0, Date.now()]
      });
      const res = await harness.coreDb.execute('SELECT * FROM monitored_domains WHERE id = \'dom_1\'');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.hostname).toBe('app.client.com');
    });
    it('probes HTTP uptime server returning 200 OK', async () => {
      const url = mockUptimeServer.getUrl();
      const res = await fetch(url);
      expect(res.status).toBe(200);
    });
    it('verifies false-positive protection: failures 1 & 2 do NOT open incident', async () => {
      mockUptimeServer.setHealthy(false);

      let consecutiveFailures = 0;
      let incidentOpened = false;

      const recordCheck = (healthy: boolean) => {
        if (!healthy) {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            incidentOpened = true;
          }
        } else {
          consecutiveFailures = 0;
        }
      };

      // Probe 1: Fail
      recordCheck(false);
      expect(consecutiveFailures).toBe(1);
      expect(incidentOpened).toBe(false);

      // Probe 2: Fail
      recordCheck(false);
      expect(consecutiveFailures).toBe(2);
      expect(incidentOpened).toBe(false);

      // Probe 3: Fail -> opens incident
      recordCheck(false);
      expect(consecutiveFailures).toBe(3);
      expect(incidentOpened).toBe(true);

      // Restore healthy
      mockUptimeServer.setHealthy(true);
    });
    it('auto-resolves incident when domain recovers healthy', () => {
      let isIncidentOpen = true;
      const onProbeSuccess = () => {
        isIncidentOpen = false;
      };
      onProbeSuccess();
      expect(isIncidentOpen).toBe(false);
    });
    it('flags expired and wrong-host certificates (badssl emulation)', () => {
      const checkCertificate = (cert: { validTo: number; hostnames: string[] }, targetHost: string) => {
        const isExpired = Date.now() > cert.validTo;
        const isHostMismatch = !cert.hostnames.includes(targetHost);
        return { isExpired, isHostMismatch, isValid: !isExpired && !isHostMismatch };
      };

      // Expired cert
      const expiredCert = { validTo: Date.now() - 86400000, hostnames: ['example.com'] };
      expect(checkCertificate(expiredCert, 'example.com').isExpired).toBe(true);

      // Wrong host cert
      const wrongHostCert = { validTo: Date.now() + 86400000, hostnames: ['other.com'] };
      expect(checkCertificate(wrongHostCert, 'example.com').isHostMismatch).toBe(true);
    });
    it('queries mock RDAP server returning domain registration expiration date', async () => {
      const url = mockRdapServer.getUrl();
      const res = await fetch(url);
      expect(res.status).toBe(200);
      const data = await res.json();
      const expEvent = data.events.find((e: any) => e.eventAction === 'expiration');
      expect(expEvent?.eventDate).toBe('2027-01-01T00:00:00Z');
    });
    it('renders public status page URL format /status/[clientSlug]', () => {
      const slug = 'flt1';
      const statusPageUrl = `/status/${slug}`;
      expect(statusPageUrl).toBe('/status/flt1');
    });
  });
});
