import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bootstrap, gracefulShutdown, activeJobs } from "../src/index";
import { SlaEscalatorJob } from "../src/jobs/sla-escalator";
import { DunningJob } from "../src/jobs/dunning";
import { getContainer } from "@rsl/core/container";
import { Ticket } from "@rsl/core/support";
import { Invoice } from "@rsl/core/billing";
import { Client, ClientContact } from "@rsl/core/clients";
import { runMigrations } from "@rsl/core/db";
import { newId, toDateKey } from "@rsl/core/kernel";

describe("RapidShift Worker & Automation Daemon Lifecycle", () => {
  beforeEach(async () => {
    await runMigrations();
  });

  afterEach(async () => {
    // Ensure all jobs are drained after each test
    await gracefulShutdown("TEST_CLEANUP", false);
  });

  it("initializes database migrations, registers all background jobs, and drains gracefully", async () => {
    const jobs = await bootstrap();

    expect(jobs).toBeDefined();
    expect(jobs.length).toBe(11);

    const jobNames = jobs.map((j) => j.name);
    expect(jobNames).toContain("OutboxPoller");
    expect(jobNames).toContain("InvoiceGenerator");
    expect(jobNames).toContain("DunningJob");
    expect(jobNames).toContain("UptimeChecker");
    expect(jobNames).toContain("SslChecker");
    expect(jobNames).toContain("DnsChecker");
    expect(jobNames).toContain("MetricsPoller");
    expect(jobNames).toContain("RdapChecker");
    expect(jobNames).toContain("SlaEscalator");
    expect(jobNames).toContain("AnalyticsRollup");
    expect(jobNames).toContain("AnalyticsOffload");

    // Test graceful shutdown without process.exit
    await expect(gracefulShutdown("SIGTERM", false)).resolves.not.toThrow();
  });
});

describe("SLA Escalator Daemon (Milestone 5 Support Desk)", () => {
  beforeEach(async () => {
    await runMigrations();
  });

  it("detects first response SLA breach and auto-escalates from L1 -> L2 with email alert", async () => {
    const container = getContainer();
    const now = Date.now();
    const clientId = newId("cli");

    // 1. Create client and contact
    const client = new Client({
      id: clientId,
      name: "Acme Cloud Corp",
      slug: `acme-${Date.now()}`,
      billingMode: "gst",
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "active",
      country: "India",
      createdAt: now,
      updatedAt: now,
    });
    await container.clientDirectoryRepo.create(client);

    const contact = ClientContact.create({
      clientId,
      name: "Alice Ops",
      email: `alice-${Date.now()}@acmecloud.com`,
      isPrimary: true,
    });
    await container.clientDirectoryRepo.addContact(contact);

    // 2. Create ticket with breached first response deadline (due 30 mins ago)
    const ticket = Ticket.create({
      id: newId("tkt"),
      clientId,
      subject: "Production database unreachable",
      priority: "P1", // 15m response SLA
      createdAt: now - 45 * 60 * 1000, // created 45m ago
    });
    await container.ticketRepo.save(ticket);

    expect(ticket.level).toBe("L1");
    expect(ticket.status).toBe("open");
    expect(ticket.slaBreached).toBe(false);

    // 3. Spy on emailSender to verify alert dispatch
    const sendEmailSpy = vi.spyOn(container.settingsModule.emailSender, "send").mockResolvedValue({
      messageId: "mock-escalation-id",
      accepted: true,
    });

    // 4. Run SLA escalator cycle
    const escalator = new SlaEscalatorJob({ workerId: "test-worker", pollIntervalMs: 60_000 });
    await escalator.runCycle();
    await escalator.stop();

    // 5. Verify escalation to L2
    const updated = await container.ticketRepo.findById(ticket.id);
    expect(updated).not.toBeNull();
    expect(updated!.level).toBe("L2");
    expect(updated!.status).toBe("escalated");
    expect(updated!.slaBreached).toBe(true);

    // 6. Verify email notification was triggered for this ticket
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: contact.email,
        subject: expect.stringContaining("[SLA ESCALATION L2]"),
      }),
    );
  });

  it("detects resolution SLA breach and auto-escalates from L2 -> L3", async () => {
    const container = getContainer();
    const now = Date.now();
    const clientId = newId("cli");

    const client = new Client({
      id: clientId,
      name: "Beta Corp",
      slug: `beta-${Date.now()}`,
      billingMode: "non_gst",
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "active",
      country: "India",
      createdAt: now,
      updatedAt: now,
    });
    await container.clientDirectoryRepo.create(client);

    const contact = ClientContact.create({
      clientId,
      name: "Bob Lead",
      email: `bob-${Date.now()}@acmecloud.com`,
      isPrimary: true,
    });
    await container.clientDirectoryRepo.addContact(contact);

    // Create ticket already at L2 whose resolution SLA (4h for P1) breached 2 hours ago
    const ticket = Ticket.create({
      id: newId("tkt"),
      clientId,
      subject: "Critical security patch required",
      priority: "P1",
      createdAt: now - 6 * 3600 * 1000, // 6h ago
    });

    // Advance to L2 with updatedAt > 60s ago
    ticket.escalate("Initial response breach", "system", "L2", now - 2 * 3600 * 1000);
    await container.ticketRepo.save(ticket);

    expect(ticket.level).toBe("L2");

    const sendEmailSpy = vi.spyOn(container.settingsModule.emailSender, "send").mockResolvedValue({
      messageId: "mock-l3-id",
      accepted: true,
    });

    const escalator = new SlaEscalatorJob({ workerId: "test-worker", pollIntervalMs: 60_000 });
    await escalator.runCycle();
    await escalator.stop();

    const updated = await container.ticketRepo.findById(ticket.id);
    expect(updated).not.toBeNull();
    expect(updated!.level).toBe("L3");
    expect(updated!.status).toBe("escalated");

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: contact.email,
        subject: expect.stringContaining("[SLA ESCALATION L3]"),
      }),
    );
  });

  it("does not escalate paused tickets (status: waiting_on_client)", async () => {
    const container = getContainer();
    const now = Date.now();
    const clientId = newId("cli");

    const ticket = Ticket.create({
      id: newId("tkt"),
      clientId,
      subject: "Awaiting logs from customer",
      priority: "P1",
      createdAt: now - 2 * 3600 * 1000,
    });

    ticket.updateStatus("waiting_on_client", now - 3600 * 1000, "Waiting for server logs");
    await container.ticketRepo.save(ticket);

    const escalator = new SlaEscalatorJob({ workerId: "test-worker", pollIntervalMs: 60_000 });
    await escalator.runCycle();
    await escalator.stop();

    const updated = await container.ticketRepo.findById(ticket.id);
    expect(updated!.level).toBe("L1");
    expect(updated!.status).toBe("waiting_on_client");
  });
});

describe("Dunning Reminder Daemon (Milestone 2 Collections)", () => {
  beforeEach(async () => {
    await runMigrations();
  });

  it("evaluates overdue invoices, calculates offsets, and dispatches dunning notice emails", async () => {
    const container = getContainer();
    const now = Date.now();
    const clientId = newId("cli");

    const client = new Client({
      id: clientId,
      name: "Partner Tech",
      slug: `partner-${Date.now()}`,
      billingMode: "non_gst",
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "active",
      country: "India",
      createdAt: now,
      updatedAt: now,
    });
    await container.clientDirectoryRepo.create(client);

    const contact = ClientContact.create({
      clientId,
      name: "Finance Manager",
      email: `finance-${Date.now()}@partner.com`,
      isPrimary: true,
    });
    await container.clientDirectoryRepo.addContact(contact);

    // 2. Create an invoice due today (offset 0)
    const invoice = Invoice.create({
      clientId,
      contractId: newId("cnt"),
      invoiceNumber: `INV-TEST-${Date.now()}`,
      billingMode: "non_gst",
      issueDate: now - 30 * 86400 * 1000,
      dueDate: now, // Due today!
      currency: "INR",
      lines: [
        {
          id: newId("ln"),
          description: "Monthly Retainer",
          quantity: 1,
          unitPriceMinor: 5000000, // 50,000 INR
        },
      ],
      createdAt: now - 30 * 86400 * 1000,
    });
    invoice.issue(now - 30 * 86400 * 1000);
    await container.billingRepo.saveInvoice(invoice);

    // 3. Spy on sendDunningEmail
    const dunningSpy = vi.spyOn(container.billingModule.emailService, "sendDunningEmail").mockResolvedValue();

    // 4. Run dunning job
    const dunningJob = new DunningJob({ workerId: "test-worker", pollIntervalMs: 60_000 });
    await dunningJob.runCycle();

    expect(dunningSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: contact.email,
        daysOffset: 0,
      }),
    );

    const callCountAfterFirstRun = dunningSpy.mock.calls.length;
    // 5. Subsequent run in same day must deduplicate
    await dunningJob.runCycle();
    expect(dunningSpy.mock.calls.length).toBe(callCountAfterFirstRun);

    await dunningJob.stop();
  });
});
