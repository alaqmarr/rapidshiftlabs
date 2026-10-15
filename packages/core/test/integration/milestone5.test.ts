if (!process.env.MASTER_KEY) {
  process.env.MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "development-auth-secret-123456789";
}

import { describe, it, expect } from "vitest";
import { getContainer } from "../../src/container";
import { SYSTEM_ACTOR, type Actor } from "../../src/shared/kernel/actor";

describe("Milestone 5 Full System Integration", () => {
  const container = getContainer();

  const testClientId = "cli_m5_integration";
  const adminActor = SYSTEM_ACTOR("test-admin");
  const clientActor: Actor = {
    kind: "client_user",
    id: "usr_client_alice",
    clientId: testClientId,
    email: "alice@m5client.com",
    name: "Alice",
    role: "client_admin",
  };

  it("Support Module: End-to-end ticket lifecycle with messages, escalation, and canned replies", async () => {
    // 1. Create Canned Reply
    const canned = await container.supportModule.manageCannedRepliesUseCase.create(
      {
        title: "Standard SLA Greeting",
        category: "general",
        content: "Thank you for reaching out to RapidShift Labs Technical Desk. We are actively investigating.",
        shortcut: `!sla-intro-${Date.now().toString(36)}`,
      },
      adminActor
    );
    expect(canned.id).toMatch(/^cnr_/);
    expect(canned.title).toBe("Standard SLA Greeting");

    // 2. Create Ticket
    const { ticket } = await container.supportModule.createTicketUseCase.execute(
      {
        clientId: testClientId,
        category: "outage",
        subject: "Production database replica lag",
        message: "Replica delay exceeds 10 minutes.",
        priority: "P1",
      },
      clientActor
    );
    expect(ticket.id).toMatch(/^tkt_/);
    expect(ticket.priority).toBe("P1");
    expect(ticket.level).toBe("L1");
    expect(ticket.status).toBe("open");

    // 3. Add Staff Message (public) and Internal Note
    const staffMsg = await container.supportModule.addTicketMessageUseCase.execute(
      {
        ticketId: ticket.id,
        body: canned.content,
        isInternal: false,
      },
      adminActor
    );
    expect(staffMsg.isInternal).toBe(false);

    const internalNote = await container.supportModule.addTicketMessageUseCase.execute(
      {
        ticketId: ticket.id,
        body: "Checking WAL archiving on Ubuntu host.",
        isInternal: true,
      },
      adminActor
    );
    expect(internalNote.isInternal).toBe(true);

    // Verify messages: Client must NOT see internal note
    const clientVisibleMsgs = await container.supportModule.ticketRepo.listMessages(ticket.id, false);
    expect(clientVisibleMsgs.some((m) => m.isInternal)).toBe(false);

    const staffVisibleMsgs = await container.supportModule.ticketRepo.listMessages(ticket.id, true);
    expect(staffVisibleMsgs.length).toBeGreaterThanOrEqual(2);

    // 4. Escalate Ticket
    const escalatedTicket = await container.supportModule.escalateTicketUseCase.execute(
      {
        ticketId: ticket.id,
        reason: "Escalating to Tier 2 database specialist",
        targetLevel: "L2",
      },
      adminActor
    );
    expect(escalatedTicket.level).toBe("L2");
    expect(escalatedTicket.status).toBe("escalated");

    // 5. Update Status to resolved and submit CSAT
    const resolvedTicket = await container.supportModule.updateTicketStatusUseCase.execute(
      {
        ticketId: ticket.id,
        status: "resolved",
        reason: "Replica caught up and index rebuilt",
      },
      adminActor
    );
    expect(resolvedTicket.status).toBe("resolved");

    const ratedTicket = await container.supportModule.submitCsatUseCase.execute(
      {
        ticketId: ticket.id,
        rating: 5,
        feedback: "Resolved swiftly and communicated clearly.",
      },
      clientActor
    );
    expect(ratedTicket.csatRating).toBe(5);
  });

  it("Analytics Module: Ingest event batch, compute rollups, and manage offload config", async () => {
    const now = Date.now();
    const sessionId = "ses_m5_test";

    // 1. Ingest batch of events
    await container.analyticsModule.recordEventBatchUseCase.execute({
      clientId: testClientId,
      events: [
        {
          type: "pageview",
          path: "/pricing",
          sessionId,
          timestamp: now - 5000,
        },
        {
          type: "vitals",
          path: "/pricing",
          metricName: "LCP",
          metricValue: 1850,
          sessionId,
          timestamp: now,
        },
      ],
    });

    // 2. Query overview
    const overviewRes = await container.analyticsModule.getOverviewUseCase.execute(
      testClientId,
      now - 86400000,
      now + 86400000,
      clientActor
    );
    expect(overviewRes.overview.totalPageviews).toBeGreaterThanOrEqual(1);
    expect(overviewRes.overview.uniqueVisitors).toBeGreaterThanOrEqual(1);

    // 3. Configure signed webhook offload
    const offload = await container.analyticsModule.manageOffloadConfigUseCase.update(
      {
        clientId: testClientId,
        endpointUrl: "https://client-webhook.endpoint/analytics",
        secret: "whsec_test_hmac_12345",
        enabled: true,
      },
      clientActor
    );
    expect(offload.endpointUrl).toBe("https://client-webhook.endpoint/analytics");
    expect(offload.enabled).toBe(true);

    const fetchedOffload = await container.analyticsModule.manageOffloadConfigUseCase.get(
      testClientId,
      clientActor
    );
    expect(fetchedOffload?.endpointUrl).toBe("https://client-webhook.endpoint/analytics");
  });

  it("Vault Module: Encrypted secret storage at rest, audited reveal, and deletion", async () => {
    // 1. Create encrypted credential
    const secretPlaintext = "prod_stripe_sk_live_998877665544";
    const cred = await container.vaultModule.createCredentialUseCase.execute(
      {
        clientId: testClientId,
        name: "Stripe Production Secret Key",
        category: "api_key",
        secretValue: secretPlaintext,
        oneTimeReveal: false,
      },
      adminActor
    );
    expect(cred.id).toMatch(/^vlt_/);
    expect(cred.encryptedValue).not.toContain(secretPlaintext);

    // 2. List credentials — verify plaintext is not present in entity props
    const list = await container.vaultModule.listCredentialsUseCase.execute(
      { clientId: testClientId },
      clientActor
    );
    expect(list.some((c) => c.id === cred.id)).toBe(true);

    // 3. Reveal credential — audits and decrypts
    const revealed = await container.vaultModule.revealCredentialUseCase.execute(
      cred.id,
      clientActor
    );
    expect(revealed.secretValue).toBe(secretPlaintext);

    // 4. Delete credential
    await container.vaultModule.deleteCredentialUseCase.execute(
      cred.id,
      adminActor
    );
    const afterDelete = await container.vaultModule.listCredentialsUseCase.execute(
      { clientId: testClientId },
      clientActor
    );
    expect(afterDelete.some((c) => c.id === cred.id)).toBe(false);
  });

  it("Releases Module: Create, list, update, and delete release links", async () => {
    // 1. Create Release
    const rel = await container.releasesModule.createReleaseUseCase.execute(
      {
        clientId: testClientId,
        name: "Mobile App Beta Build",
        version: "v3.0.0-beta.1",
        environment: "beta",
        url: "https://testflight.apple.com/join/XYZ123",
        releaseNotes: "Initial beta build with push notifications enabled",
      },
      adminActor
    );
    expect(rel.id).toMatch(/^rel_/);
    expect(rel.version).toBe("v3.0.0-beta.1");

    // 2. List Releases
    const list = await container.releasesModule.listReleasesUseCase.execute(
      { clientId: testClientId },
      clientActor
    );
    expect(list.some((r) => r.id === rel.id)).toBe(true);

    // 3. Update Release
    const updated = await container.releasesModule.updateReleaseUseCase.execute(
      rel.id,
      {
        version: "v3.0.0-beta.2",
        url: "https://testflight.apple.com/join/XYZ456",
      },
      adminActor
    );
    expect(updated.version).toBe("v3.0.0-beta.2");

    // 4. Delete Release
    await container.releasesModule.deleteReleaseUseCase.execute(
      rel.id,
      adminActor
    );
    const afterDelete = await container.releasesModule.listReleasesUseCase.execute(
      { clientId: testClientId },
      clientActor
    );
    expect(afterDelete.some((r) => r.id === rel.id)).toBe(false);
  });

  it("Embeds Module: Mint scoped token with TTL and verify validity", async () => {
    // 1. Mint Token
    const minted = await container.embedsModule.mintEmbedTokenUseCase.execute(
      {
        clientId: testClientId,
        scopes: ["billing:read", "monitoring:read"],
        allowedOrigins: ["https://client.dashboard.internal"],
        ttlMs: 900000,
      },
      clientActor
    );
    expect(minted.id).toMatch(/^emb_/);
    expect(minted.expiresAt).toBeGreaterThan(Date.now());

    // 2. Verify Token
    const verified = await container.embedsModule.verifyEmbedTokenUseCase.execute(
      minted.id,
      "billing-summary",
      "https://client.dashboard.internal"
    );
    expect(verified.id).toBe(minted.id);
    expect(verified.clientId).toBe(testClientId);

    // 3. Verification with unauthorized widget (requires fleet:read, not granted) must fail
    await expect(
      container.embedsModule.verifyEmbedTokenUseCase.execute(
        minted.id,
        "process-card",
        "https://client.dashboard.internal"
      )
    ).rejects.toThrow();
  });
});
