import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { Email } from "../src/modules/identity/domain/value-objects/email.vo";
import { Password } from "../src/modules/identity/domain/value-objects/password.vo";
import { TotpSecret } from "../src/modules/identity/domain/value-objects/totp-secret.vo";
import { Argon2PasswordHasher } from "../src/modules/identity/infrastructure/crypto/argon2-password-hasher";
import { Rfc6238Totp } from "../src/shared/infrastructure/crypto/rfc6238-totp";
import { AesGcmCipher } from "../src/shared/infrastructure/crypto/aes-gcm-cipher";
import { AdminUser } from "../src/modules/identity/domain/entities/admin-user.entity";
import { ClientUser } from "../src/modules/identity/domain/entities/client-user.entity";
import { DrizzleAdminUserRepository } from "../src/modules/identity/infrastructure/repositories/drizzle-admin-user.repository";
import { DrizzleClientUserRepository } from "../src/modules/identity/infrastructure/repositories/drizzle-client-user.repository";
import { IdentityModule } from "../src/modules/identity";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases } from "../src/shared/infrastructure/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Identity Module & Cryptography Unit Tests", () => {
  const testDataDir = path.join(__dirname, "temp_identity_test");
  const coreDbPath = path.join(testDataDir, "core.db");
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Set test environment configuration
    process.env.MASTER_KEY = testMasterKey;
    process.env.AUTH_SECRET = "test-auth-secret-123456789";
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

    // Initialize core tables
    await client.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'support',
        support_level INTEGER,
        password_hash TEXT NOT NULL,
        totp_secret_enc TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        session_version INTEGER NOT NULL DEFAULT 1,
        last_login_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS client_users (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'client_member',
        password_hash TEXT NOT NULL,
        session_version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        invited_at INTEGER,
        last_login_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    client.close();
  });

  afterAll(() => {
    closeAllDatabases();
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe("Value Objects", () => {
    it("validates Email value object", () => {
      const valid = Email.create("  Admin@RapidShiftLabs.com ");
      expect(valid.value).toBe("admin@rapidshiftlabs.com");
      expect(valid.equals(Email.create("admin@rapidshiftlabs.com"))).toBe(true);

      expect(() => Email.create("invalid-email")).toThrow();
      expect(() => Email.create("")).toThrow();
    });

    it("hashes and verifies password using Argon2id", async () => {
      const hasher = new Argon2PasswordHasher();
      const plain = "SuperSecretPassword123!";

      const hash = await hasher.hash(plain);
      expect(hash).toContain("$argon2id$");

      const passwordVo = Password.fromHash(hash);
      expect(passwordVo.hash).toBe(hash);

      const isValid = await hasher.verify(hash, plain);
      expect(isValid).toBe(true);

      const isInvalid = await hasher.verify(hash, "WrongPassword123!");
      expect(isInvalid).toBe(false);

      await expect(hasher.hash("short")).rejects.toThrow();
    });

    it("generates and verifies RFC 6238 TOTP tokens", () => {
      const secret = Rfc6238Totp.generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);

      const secretVo = TotpSecret.fromBase32(secret);
      expect(secretVo.secret).toBe(secret);

      const uri = Rfc6238Totp.generateOtpAuthUri({
        secret,
        accountName: "admin@rapidshift.com",
        issuer: "RapidShift Labs",
      });
      expect(uri).toContain("otpauth://totp/");
      expect(uri).toContain("secret=" + secret);

      const now = Date.now();
      const token = Rfc6238Totp.generateToken(secret, now);
      expect(token).toMatch(/^\d{6}$/);

      // Verify current token
      expect(Rfc6238Totp.verifyToken({ secret, token, timestampMs: now })).toBe(true);

      // Verify with 30s clock skew backward (within window=1)
      expect(Rfc6238Totp.verifyToken({ secret, token, timestampMs: now + 30_000 })).toBe(true);

      // Verify with 30s clock skew forward (within window=1)
      expect(Rfc6238Totp.verifyToken({ secret, token, timestampMs: now - 30_000 })).toBe(true);

      // Outside window (65s) should fail
      expect(Rfc6238Totp.verifyToken({ secret, token, timestampMs: now + 65_000, window: 1 })).toBe(false);

      // Invalid tokens fail
      expect(Rfc6238Totp.verifyToken({ secret, token: "999999", timestampMs: now })).toBe(false);
      expect(Rfc6238Totp.verifyToken({ secret, token: "invalid", timestampMs: now })).toBe(false);
    });

    it("encrypts and decrypts secrets with AES-256-GCM envelope", () => {
      const plain = "JBSWY3DPEHPK3PXP";
      const cipher = AesGcmCipher.encrypt(plain, testMasterKey);
      expect(cipher.split(":")).toHaveLength(3);

      const decrypted = AesGcmCipher.decrypt(cipher, testMasterKey);
      expect(decrypted).toBe(plain);

      // Tampered tag must fail
      const parts = cipher.split(":");
      const tampered = `${parts[0]}:dGFtcGVyZWQ=:${parts[2]}`;
      expect(() => AesGcmCipher.decrypt(tampered, testMasterKey)).toThrow();
    });
  });

  describe("Entities & Use Cases", () => {
    it("creates, persists, and authenticates AdminUser with email+password only", async () => {
      const identityModule = new IdentityModule(
        new DrizzleAdminUserRepository(),
        new DrizzleClientUserRepository(),
      );

      // Create Admin
      const admin = await identityModule.createAdminUser({
        email: "owner@rapidshiftlabs.com",
        name: "Lead Owner",
        password: "OwnerSecurePassword2026!",
        role: "owner",
        supportLevel: 3,
      });

      expect(admin.id).toMatch(/^adm_/);
      expect(admin.email.value).toBe("owner@rapidshiftlabs.com");
      expect(admin.role).toBe("owner");
      expect(admin.sessionVersion).toBe(1);

      // Authenticate with valid credentials
      const authSuccess = await identityModule.verifyAdminCredentials({
        email: "owner@rapidshiftlabs.com",
        password: "OwnerSecurePassword2026!",
      });
      expect(authSuccess.success).toBe(true);
      expect(authSuccess.user?.email).toBe("owner@rapidshiftlabs.com");
      expect(authSuccess.user?.role).toBe("owner");

      // Authenticate with invalid credentials
      const authFail = await identityModule.verifyAdminCredentials({
        email: "owner@rapidshiftlabs.com",
        password: "WrongPassword!",
      });
      expect(authFail.success).toBe(false);
      expect(authFail.user).toBeUndefined();
    });

    it("creates, persists, and authenticates ClientUser", async () => {
      const identityModule = new IdentityModule(
        new DrizzleAdminUserRepository(),
        new DrizzleClientUserRepository(),
      );

      const clientUser = await identityModule.createClientUser({
        clientId: "cli_alpha",
        email: "client@alpha.io",
        name: "Alpha User",
        password: "AlphaSecureClient2026!",
        role: "client_admin",
      });

      expect(clientUser.id).toMatch(/^usr_/);
      expect(clientUser.clientId).toBe("cli_alpha");

      const authSuccess = await identityModule.verifyClientCredentials({
        email: "client@alpha.io",
        password: "AlphaSecureClient2026!",
      });
      expect(authSuccess.success).toBe(true);
      expect(authSuccess.user?.clientId).toBe("cli_alpha");
      expect(authSuccess.user?.role).toBe("client_admin");
    });

    it("revokes user session by incrementing session version", async () => {
      const identityModule = new IdentityModule(
        new DrizzleAdminUserRepository(),
        new DrizzleClientUserRepository(),
      );

      const admin = await identityModule.createAdminUser({
        email: "ops@rapidshiftlabs.com",
        name: "Ops Lead",
        password: "OpsPasswordSecure123!",
        role: "ops",
      });

      const initialSv = await identityModule.getSessionVersion(admin.id, "admin");
      expect(initialSv).toBe(1);

      const revokeResult = await identityModule.revokeUserSessions(admin.id, "admin");
      expect(revokeResult.success).toBe(true);
      expect(revokeResult.newSessionVersion).toBe(2);

      const updatedSv = await identityModule.getSessionVersion(admin.id, "admin");
      expect(updatedSv).toBe(2);
    });

    it("updates credentials when creating client user that already exists for same client", async () => {
      const identityModule = new IdentityModule(
        new DrizzleAdminUserRepository(),
        new DrizzleClientUserRepository(),
      );

      // Create initial client user
      const user = await identityModule.createClientUser({
        clientId: "cli_beta",
        email: "member@beta.io",
        name: "Beta Member",
        password: "InitialPassword123!",
        role: "client_member",
      });
      expect(user.id).toBeDefined();

      // Reset / Re-create credentials with new password
      const updatedUser = await identityModule.createClientUser({
        clientId: "cli_beta",
        email: "member@beta.io",
        name: "Beta Member Updated",
        password: "NewStrongPassword456!",
        role: "client_admin",
      });

      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.name).toBe("Beta Member Updated");
      expect(updatedUser.role).toBe("client_admin");

      // Verify old password fails
      const oldAuth = await identityModule.verifyClientCredentials({
        email: "member@beta.io",
        password: "InitialPassword123!",
      });
      expect(oldAuth.success).toBe(false);

      // Verify new password succeeds
      const newAuth = await identityModule.verifyClientCredentials({
        email: "member@beta.io",
        password: "NewStrongPassword456!",
      });
      expect(newAuth.success).toBe(true);
      expect(newAuth.user?.name).toBe("Beta Member Updated");
      expect(newAuth.user?.role).toBe("client_admin");
    });

    it("rejects creating client user if email is registered to a different organization", async () => {
      const identityModule = new IdentityModule(
        new DrizzleAdminUserRepository(),
        new DrizzleClientUserRepository(),
      );

      await expect(
        identityModule.createClientUser({
          clientId: "cli_gamma", // Different client!
          email: "member@beta.io", // Belongs to cli_beta
          name: "Intruder",
          password: "IntruderPassword123!",
        }),
      ).rejects.toThrow(/registered to another client organization/);
    });

    it("enforces RBAC, staff management, and sole-owner protection", async () => {
      const identityModule = new IdentityModule(
        new DrizzleAdminUserRepository(),
        new DrizzleClientUserRepository(),
      );

      const ownerActor = {
        kind: "admin" as const,
        id: "adm_owner_primary",
        email: "owner@rapidshiftlabs.com",
        name: "Primary Owner",
        role: "owner" as const,
        supportLevel: 3 as const,
      };

      const supportActor = {
        kind: "admin" as const,
        id: "adm_support_test",
        email: "support@rapidshiftlabs.com",
        name: "Support Staff",
        role: "support" as const,
        supportLevel: 1 as const,
      };

      // 1. List staff with owner
      const list = await identityModule.listAdminUsers(ownerActor);
      expect(list.length).toBeGreaterThan(0);
      const primaryOwner = list.find((u) => u.role === "owner")!;
      ownerActor.id = primaryOwner.id;

      // Support staff cannot list staff (lacks team:read)
      await expect(identityModule.listAdminUsers(supportActor)).rejects.toThrow(/Missing permission 'team:read'/);

      // 2. Create new staff member
      const newStaff = await identityModule.createAdminUserUseCase.execute(
        {
          name: "DevOps Engineer",
          email: "devops@rapidshiftlabs.com",
          password: "DevOpsPass1234!",
          role: "ops",
        },
        ownerActor,
      );
      expect(newStaff.name).toBe("DevOps Engineer");
      expect(newStaff.role).toBe("ops");
      expect(newStaff.status).toBe("active");

      // 3. Suspend staff member and verify sessionVersion increments
      const initialSv = newStaff.sessionVersion;
      const suspended = await identityModule.updateAdminUser(
        {
          id: newStaff.id,
          status: "suspended",
        },
        ownerActor,
      );
      expect(suspended.status).toBe("suspended");
      expect(suspended.sessionVersion).toBe(initialSv + 1);

      // Suspended admin cannot log in
      const suspendedLogin = await identityModule.verifyAdminCredentials({
        email: "devops@rapidshiftlabs.com",
        password: "DevOpsPass1234!",
      });
      expect(suspendedLogin.success).toBe(false);
      expect(suspendedLogin.error).toContain("Account is suspended");

      // 4. Reactivate staff member
      const activated = await identityModule.updateAdminUser(
        {
          id: newStaff.id,
          status: "active",
        },
        ownerActor,
      );
      expect(activated.status).toBe("active");

      const reactivatedLogin = await identityModule.verifyAdminCredentials({
        email: "devops@rapidshiftlabs.com",
        password: "DevOpsPass1234!",
      });
      expect(reactivatedLogin.success).toBe(true);

      // 5. Reset password
      await identityModule.updateAdminUser(
        {
          id: newStaff.id,
          password: "BrandNewPass999!",
        },
        ownerActor,
      );
      const oldPassLogin = await identityModule.verifyAdminCredentials({
        email: "devops@rapidshiftlabs.com",
        password: "DevOpsPass1234!",
      });
      expect(oldPassLogin.success).toBe(false);

      const newPassLogin = await identityModule.verifyAdminCredentials({
        email: "devops@rapidshiftlabs.com",
        password: "BrandNewPass999!",
      });
      expect(newPassLogin.success).toBe(true);

      // 6. Prevent deleting self
      await expect(
        identityModule.deleteAdminUser(ownerActor.id, ownerActor),
      ).rejects.toThrow(/You cannot delete your own account/);

      // 7. Prevent deleting sole remaining owner
      const allOwners = (await identityModule.listAdminUsers(ownerActor)).filter((u) => u.role === "owner");
      if (allOwners.length === 1) {
        await expect(
          identityModule.deleteAdminUser(allOwners[0].id, { ...ownerActor, id: "adm_other" }),
        ).rejects.toThrow(/sole remaining Owner/);
      }

      // 8. Delete the created staff member
      const deleteResult = await identityModule.deleteAdminUser(newStaff.id, ownerActor);
      expect(deleteResult.success).toBe(true);
    });
  });
});
