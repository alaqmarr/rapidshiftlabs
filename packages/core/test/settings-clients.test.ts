import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases, getDb, ensurePragmas } from "../src/shared/infrastructure/db";
import { settings } from "../src/shared/infrastructure/db/schema/settings";
import { DrizzleSettingsRepository } from "../src/modules/settings/infrastructure/repositories/drizzle-settings.repository";
import { Client } from "../src/modules/clients/domain/entities/client.entity";
import { ClientContact } from "../src/modules/clients/domain/entities/client-contact.entity";
import { Project } from "../src/modules/clients/domain/entities/project.entity";
import { DrizzleClientRepository } from "../src/modules/clients/infrastructure/repositories/drizzle-client.repository";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Settings & CRM Client Aggregates Integration Tests", () => {
  const testDataDir = path.join(__dirname, "temp_settings_clients_test");
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    process.env.MASTER_KEY = testMasterKey;
    process.env.AUTH_SECRET = "test-auth-secret-settings";
    process.env.DATA_DIR = testDataDir;

    setConfigForTests({
      dataDir: testDataDir,
      MASTER_KEY: testMasterKey,
      AUTH_SECRET: "test-auth-secret-settings",
      dbPaths: {
        core: path.join(testDataDir, "core.db"),
        analytics: path.join(testDataDir, "analytics.db"),
        metrics: path.join(testDataDir, "metrics.db"),
      },
    });

    await ensurePragmas("core");
    // Run schema creation in test DB
    const { migrateCoreSchema } = await import("../src/scripts/migrate");
    await migrateCoreSchema();
  });

  afterAll(() => {
    closeAllDatabases();
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("stores and retrieves company settings accurately", async () => {
    const settingsRepo = new DrizzleSettingsRepository();

    const companyData = {
      legalName: "RapidShift Labs Pvt Ltd",
      tradeName: "RapidShift Labs",
      gstin: "29AABCR1234F1Z5",
      pan: "AABCR1234F",
      state: "Karnataka",
      addressLine1: "Indiranagar 100ft Road",
      city: "Bengaluru",
      postalCode: "560038",
      country: "India",
      bankName: "ICICI Bank",
      accountNumber: "987654321000",
      ifsc: "ICIC0001234",
      upiId: "rapidshift@icici",
      phone: "+91 98000 00000",
      email: "contact@rapidshiftlabs.com",
    };

    await settingsRepo.saveCompanySettings(companyData);

    const retrieved = await settingsRepo.getCompanySettings();
    expect(retrieved.legalName).toBe("RapidShift Labs Pvt Ltd");
    expect(retrieved.gstin).toBe("29AABCR1234F1Z5");
    expect(retrieved.upiId).toBe("rapidshift@icici");
    expect(retrieved.state).toBe("Karnataka");
  });

  it("encrypts SMTP password in DB with AES-256-GCM and decrypts on retrieval", async () => {
    const settingsRepo = new DrizzleSettingsRepository();
    const rawSecretPassword = "SuperSecretGmailAppPassword#2026!";

    await settingsRepo.saveEmailSettings({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "billing@rapidshiftlabs.com",
      pass: rawSecretPassword,
      fromName: "RapidShift Labs Billing",
      fromEmail: "billing@rapidshiftlabs.com",
    });

    // 1. Inspect raw DB row directly to verify cipher text is NOT in plaintext
    const db = getDb("core");
    const rawRows = await db.select().from(settings).where(eq(settings.key, "email")).limit(1);
    expect(rawRows).toHaveLength(1);
    expect(rawRows[0]!.encrypted).toBe(true);

    const parsedRaw = JSON.parse(rawRows[0]!.value);
    expect(parsedRaw.pass).not.toBe(rawSecretPassword);
    expect(parsedRaw.pass).toContain(":"); // IV:Tag:Ciphertext format

    // 2. Retrieve via repository to verify transparent decryption
    const retrieved = await settingsRepo.getEmailSettings();
    expect(retrieved.user).toBe("billing@rapidshiftlabs.com");
    expect(retrieved.pass).toBe(rawSecretPassword);
  });

  it("persists Client aggregate, contacts and projects with full CRUD", async () => {
    const clientRepo = new DrizzleClientRepository();

    // 1. Create client
    const client = Client.create({
      name: "Acme Enterprise Corp",
      slug: "acme-corp",
      gstin: "27AAACA1234A1Z1",
      pan: "AAACA1234A",
      billingMode: "gst",
      currency: "INR",
      state: "Maharashtra",
      country: "India",
    });

    await clientRepo.create(client);

    const fetched = await clientRepo.findById(client.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Acme Enterprise Corp");
    expect(fetched!.slug).toBe("acme-corp");
    expect(fetched!.billingMode).toBe("gst");
    expect(fetched!.state).toBe("Maharashtra");

    // 2. Add Contact
    const contact = ClientContact.create({
      clientId: client.id,
      name: "John Doe",
      email: "john@acme.com",
      phone: "+91 99999 88888",
      title: "CTO",
      isPrimary: true,
    });
    await clientRepo.addContact(contact);

    const contacts = await clientRepo.findContactsByClient(client.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.name).toBe("John Doe");
    expect(contacts[0]!.isPrimary).toBe(true);

    // 3. Add Project
    const project = Project.create({
      clientId: client.id,
      name: "Production Web App",
      description: "Core e-commerce storefront",
    });
    await clientRepo.addProject(project);

    const projectsList = await clientRepo.findProjectsByClient(client.id);
    expect(projectsList).toHaveLength(1);
    expect(projectsList[0]!.name).toBe("Production Web App");
  });
});
