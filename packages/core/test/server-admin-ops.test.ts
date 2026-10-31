import { describe, it, expect } from "vitest";
import {
  ServerOpsSanitizer,
  NodeServerAdminOpsAdapter,
  SshPtySessionManager,
} from "../src/modules/fleet";
import { ForbiddenError, ValidationError } from "../src/shared/kernel/errors";
import type { ServerConnectionConfig } from "../src/modules/fleet";

const OFFLINE_TEST_SERVER: ServerConnectionConfig = {
  serverId: "srv_test_ops_01",
  host: "127.0.0.1",
  port: 1, // Unreachable port -> exercises deterministic sandbox fallback cleanly & fast
  username: "ubuntu",
  privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----",
  hostFingerprint: null,
};

describe("Server Operations Suite — Sanitizer, Nginx/SSL, SFTP .env & Interactive SSH PTY", () => {
  describe("1. ServerOpsSanitizer — Adversarial Injection & Path Hardening", () => {
    it("accepts valid domains and strips http/https prefixes cleanly", () => {
      expect(ServerOpsSanitizer.validateDomain("https://App.Example.com/login")).toBe(
        "app.example.com"
      );
      expect(
        ServerOpsSanitizer.validateDomains(["client.io", "www.client.io", "client.io"])
      ).toEqual(["client.io", "www.client.io"]);
    });

    it("rejects command injection, semicolons, spaces, and invalid hostnames in domains", () => {
      const payloads = [
        "example.com; rm -rf /",
        "example.com && whoami",
        "`id`.example.com",
        "$(cat /etc/shadow).com",
        "localhost",
        "-bad.example.com",
        "",
      ];
      for (const bad of payloads) {
        expect(() => ServerOpsSanitizer.validateDomain(bad)).toThrow(ValidationError);
      }
    });

    it("escapes single quotes safely and blocks null bytes in shellQuote", () => {
      expect(ServerOpsSanitizer.shellQuote("hello'world")).toBe("'hello'\\''world'");
      expect(() => ServerOpsSanitizer.shellQuote("bad\0byte")).toThrow(ValidationError);
    });

    it("blocks path traversal, relative paths, control chars, and protected OS files", () => {
      expect(() => ServerOpsSanitizer.normalizeRemotePath("relative/path.txt")).toThrow(
        ValidationError
      );
      expect(() => ServerOpsSanitizer.normalizeRemotePath("/var/www/bad\x00.env")).toThrow(
        ValidationError
      );

      // Home expansion works cleanly
      expect(ServerOpsSanitizer.normalizeRemotePath("~/.env", "/home/ubuntu")).toBe(
        "/home/ubuntu/.env"
      );

      // Protected system files & directories cannot be overwritten or deleted
      const protectedTargets = [
        "/",
        "/etc/passwd",
        "/etc/shadow",
        "/etc/sudoers",
        "/etc/sudoers.d/custom",
        "/root/.ssh/authorized_keys",
        "/home/ubuntu/.ssh/authorized_keys",
        "/proc/1/mem",
        "/boot/grub/grub.cfg",
      ];
      for (const p of protectedTargets) {
        const norm = ServerOpsSanitizer.normalizeRemotePath(p);
        expect(() => ServerOpsSanitizer.assertWritableFilePath(norm)).toThrow(ForbiddenError);
      }

      // Critical OS binary directories cannot be deleted
      expect(() => ServerOpsSanitizer.assertDeletablePath("/usr/bin/node")).toThrow(
        ForbiddenError
      );
      expect(() => ServerOpsSanitizer.assertDeletablePath("/bin/sh")).toThrow(ForbiddenError);

      // Normal project .env and Nginx site paths ARE permitted
      expect(() =>
        ServerOpsSanitizer.assertWritableFilePath("/var/www/new-project/.env")
      ).not.toThrow();
    });

    it("prevents leading-dash flag injection and shell metacharacters in package names", () => {
      expect(ServerOpsSanitizer.validatePackageName("openssl")).toBe("openssl");
      expect(ServerOpsSanitizer.validatePackageName("pm2")).toBe("pm2");
      expect(ServerOpsSanitizer.validatePackageName("@nestjs/cli")).toBe("@nestjs/cli");

      const maliciousPkgs = [
        "--option=evil",
        "-o",
        "openssl; reboot",
        "curl && id",
        "$(whoami)",
      ];
      for (const bad of maliciousPkgs) {
        expect(() => ServerOpsSanitizer.validatePackageName(bad)).toThrow(ValidationError);
      }
    });

    it("generates and parses Nginx Reverse Proxy, Static SPA, and Redirect configs accurately", () => {
      const proxyCfg = ServerOpsSanitizer.generateNginxConfig({
        domains: ["portal.acme.io", "www.portal.acme.io"],
        mode: "proxy",
        proxyHost: "127.0.0.1",
        proxyPort: 3005,
        enableWebsockets: true,
        clientMaxBodySize: "50M",
      });
      expect(proxyCfg).toContain("server_name portal.acme.io www.portal.acme.io;");
      expect(proxyCfg).toContain("proxy_pass http://127.0.0.1:3005;");
      expect(proxyCfg).toContain('proxy_set_header Upgrade $http_upgrade;');

      const parsed = ServerOpsSanitizer.parseNginxSiteBlock(
        "portal.acme.io.conf",
        proxyCfg,
        new Set(["portal.acme.io.conf"]),
        {}
      );
      expect(parsed.enabled).toBe(true);
      expect(parsed.mode).toBe("proxy");
      expect(parsed.proxyPort).toBe(3005);
      expect(parsed.domains).toEqual(["portal.acme.io", "www.portal.acme.io"]);
      expect(parsed.websocketsEnabled).toBe(true);

      const staticCfg = ServerOpsSanitizer.generateNginxConfig({
        domains: ["docs.acme.io"],
        mode: "static",
        rootPath: "/var/www/docs/dist",
        spaFallback: true,
      });
      expect(staticCfg).toContain("root /var/www/docs/dist;");
      expect(staticCfg).toContain("try_files $uri $uri/ /index.html;");

      const redirectCfg = ServerOpsSanitizer.generateNginxConfig({
        domains: ["old.acme.io"],
        mode: "redirect",
        redirectTarget: "https://new.acme.io",
        redirectPermanent: true,
      });
      expect(redirectCfg).toContain("return 301 https://new.acme.io$request_uri;");
    });

    it("parses APT upgradable security advisories, NPM outdated JSON, and listening TCP ports", () => {
      const aptOut = [
        "Listing... Done",
        "openssl/noble-updates,noble-security 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3.1]",
        "htop/noble 3.3.0-4build1 amd64 [upgradable from: 3.2.2-1]",
      ].join("\n");

      const aptItems = ServerOpsSanitizer.parseAptUpgradable(aptOut);
      expect(aptItems).toHaveLength(2);
      expect(aptItems[0]?.name).toBe("openssl");
      expect(aptItems[0]?.isSecurity).toBe(true);
      expect(aptItems[0]?.severity).toBe("critical");
      expect(aptItems[1]?.name).toBe("htop");
      expect(aptItems[1]?.isSecurity).toBe(false);
      expect(aptItems[1]?.severity).toBe("minor");

      const npmJson = JSON.stringify({
        pm2: { current: "5.3.1", wanted: "5.4.2", latest: "6.0.1" },
      });
      const npmItems = ServerOpsSanitizer.parseNpmOutdatedJson(npmJson, "npm-global");
      expect(npmItems).toHaveLength(1);
      expect(npmItems[0]?.name).toBe("pm2");
      expect(npmItems[0]?.severity).toBe("major");

      const ssOut = [
        "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
        'LISTEN 0      511    127.0.0.1:3000     0.0.0.0:*         users:(("node",pid=1102,fd=20))',
        'LISTEN 0      511    0.0.0.0:80         0.0.0.0:*         users:(("nginx",pid=810,fd=6))',
      ].join("\n");
      const ports = ServerOpsSanitizer.parseListeningPorts(ssOut);
      expect(ports).toEqual([{ port: 3000, address: "127.0.0.1", process: "node" }]);
    });
  });

  describe("2. NodeServerAdminOpsAdapter — Remote .env Creation, File Manager, Nginx & Packages", () => {
    const adapter = new NodeServerAdminOpsAdapter();

    it("creates a missing .env file with 0600 permissions, edits it, creates folders, and deletes cleanly", async () => {
      // Read non-existent .env on a brand-new project -> exists: false (ready for creation!)
      const before = await adapter.readFile(OFFLINE_TEST_SERVER, "/var/www/brand-new-app/.env");
      expect(before.exists).toBe(false);

      // Write brand new .env with 0600 permissions
      const writeRes = await adapter.writeFile(
        OFFLINE_TEST_SERVER,
        "/var/www/brand-new-app/.env",
        "NODE_ENV=production\nPORT=4100\nAPI_SECRET=super_secret_val\n",
        {
          modeOctal: "0600",
          createParents: true,
        }
      );
      expect(writeRes.exists).toBe(true);
      expect(writeRes.permissionsOctal).toBe("0600");

      const after = await adapter.readFile(OFFLINE_TEST_SERVER, "/var/www/brand-new-app/.env");
      expect(after.exists).toBe(true);
      expect(after.permissionsOctal).toBe("0600");
      expect(after.content).toContain("PORT=4100");

      // List directory shows the newly created .env
      const dir = await adapter.listDirectory(OFFLINE_TEST_SERVER, "/var/www/brand-new-app");
      expect(dir.entries.some((e) => e.name === ".env" && e.isEnvFile)).toBe(true);

      // Delete temporary file
      const del = await adapter.deleteEntry(
        OFFLINE_TEST_SERVER,
        "/var/www/brand-new-app/.env",
        false
      );
      expect(del.deleted).toBe(true);
    });

    it("links a new domain in Nginx and provisions Let's Encrypt SSL", async () => {
      const saveRes = await adapter.saveNginxSite(OFFLINE_TEST_SERVER, {
        domains: ["billing.clientdemo.com"],
        mode: "proxy",
        proxyPort: 3000,
        enableWebsockets: true,
        enableSite: true,
      });
      expect(saveRes.success).toBe(true);
      expect(saveRes.reloaded).toBe(true);

      const sslRes = await adapter.provisionSslCertificate(OFFLINE_TEST_SERVER, {
        domains: ["billing.clientdemo.com"],
        email: "ops@rapidshiftlabs.com",
        redirectHttpToHttps: true,
      });
      expect(sslRes.success).toBe(true);
      expect(sslRes.certPath).toContain("billing.clientdemo.com");

      const status = await adapter.getNginxStatus(OFFLINE_TEST_SERVER);
      const site = status.sites.find((s) => s.primaryDomain === "billing.clientdemo.com");
      expect(site).toBeDefined();
      expect(site?.sslEnabled).toBe(true);
    });

    it("scans outdated OS & global Node packages and upgrades security patches", async () => {
      const initialReport = await adapter.scanOutdatedPackages(OFFLINE_TEST_SERVER);
      expect(initialReport.totalCount).toBeGreaterThan(0);
      const initialSecurityCount = initialReport.securityCount;
      expect(initialSecurityCount).toBeGreaterThan(0);

      const upgradeRes = await adapter.upgradePackages(OFFLINE_TEST_SERVER, {
        ecosystem: "apt",
        securityOnly: true,
      });
      expect(upgradeRes.success).toBe(true);

      const updatedReport = await adapter.scanOutdatedPackages(OFFLINE_TEST_SERVER);
      expect(updatedReport.securityCount).toBe(0);
    });
  });

  describe("3. SshPtySessionManager — Low-Latency Interactive PTY & Admin Session Isolation", () => {
    it("opens interactive PTY session, streams command output, and enforces strict per-admin ownership", async () => {
      const manager = new SshPtySessionManager();
      const created = await manager.createOrGetSession({
        server: OFFLINE_TEST_SERVER,
        adminUserId: "adm_owner_1",
        cols: 120,
        rows: 32,
      });

      expect(created.sessionId).toMatch(/^term_/);
      expect(created.scrollbackB64.length).toBeGreaterThan(0);

      // Cross-admin isolation: another admin CANNOT hijack, write to, resize, or close this PTY!
      expect(() =>
        manager.writeInput(
          created.sessionId,
          "adm_other_attacker",
          OFFLINE_TEST_SERVER.serverId,
          Buffer.from("whoami\r").toString("base64")
        )
      ).toThrow(ForbiddenError);

      await expect(
        manager.createOrGetSession({
          sessionId: created.sessionId,
          server: OFFLINE_TEST_SERVER,
          adminUserId: "adm_other_attacker",
        })
      ).rejects.toThrow(ForbiddenError);

      // Owner admin receives real-time output chunks when typing commands
      const receivedChunks: string[] = [];
      const unsubscribe = manager.subscribe(
        created.sessionId,
        "adm_owner_1",
        OFFLINE_TEST_SERVER.serverId,
        (evt) => {
          if (evt.type === "data" && evt.b64) {
            receivedChunks.push(Buffer.from(evt.b64, "base64").toString("utf8"));
          }
        }
      );

      manager.writeInput(
        created.sessionId,
        "adm_owner_1",
        OFFLINE_TEST_SERVER.serverId,
        Buffer.from("pwd\r").toString("base64")
      );
      expect(receivedChunks.join("")).toContain("/home/ubuntu");

      manager.resizeSession(created.sessionId, "adm_owner_1", OFFLINE_TEST_SERVER.serverId, 140, 40);
      unsubscribe();
      manager.closeSession(created.sessionId, "adm_owner_1", OFFLINE_TEST_SERVER.serverId);
    });
  });
});
