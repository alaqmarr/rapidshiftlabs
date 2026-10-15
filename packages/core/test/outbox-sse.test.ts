import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { DrizzleEventOutboxRepository } from "../src/shared/infrastructure/events/outbox-repository";
import { getRealtimeHub } from "../src/shared/infrastructure/events/realtime-hub";
import { createEvent } from "../src/shared/kernel/domain-event";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases } from "../src/shared/infrastructure/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Transactional Outbox & In-Process SSE Hub", () => {
  const testDataDir = path.join(__dirname, "temp_outbox_test");
  const coreDbPath = path.join(testDataDir, "core.db");

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    process.env.MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.AUTH_SECRET = "test-auth-secret-123456789";
    process.env.DATA_DIR = testDataDir;

    setConfigForTests({
      dataDir: testDataDir,
      MASTER_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
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
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        client_id TEXT,
        payload TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_retry_at INTEGER,
        locked_at INTEGER,
        locked_by TEXT,
        processed_at INTEGER,
        last_error TEXT,
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

  it("appends domain events to outbox and claims them in batch", async () => {
    const outboxRepo = new DrizzleEventOutboxRepository();

    const event1 = createEvent("billing.invoice.issued", {
      aggregateType: "invoice",
      aggregateId: "inv_1001",
      clientId: "cli_acme",
      payload: { amountPaise: 50000 },
    });

    const event2 = createEvent("support.ticket.created", {
      aggregateType: "ticket",
      aggregateId: "tkt_2001",
      clientId: "cli_acme",
      payload: { title: "Cannot access server" },
    });

    await outboxRepo.append([event1, event2]);

    const claimed = await outboxRepo.claimBatch({
      batchSize: 10,
      workerId: "test-worker-1",
      lockDurationMs: 15_000,
      now: Date.now(),
    });

    expect(claimed.length).toBeGreaterThanOrEqual(2);
    const found1 = claimed.find((r) => r.id === event1.id);
    const found2 = claimed.find((r) => r.id === event2.id);

    expect(found1).toBeDefined();
    expect(found1?.status).toBe("processing");
    expect(found1?.lockedBy).toBe("test-worker-1");

    expect(found2).toBeDefined();
    expect(found2?.status).toBe("processing");

    // Mark event1 as published
    await outboxRepo.markPublished(event1.id, Date.now());

    // Mark event2 as failed
    await outboxRepo.markFailed({
      id: event2.id,
      error: "SMTP delivery timed out",
      attempts: 1,
      maxAttempts: 5,
      nextRetryAt: Date.now() + 2000,
      failedAt: Date.now(),
    });

    // Re-query: event1 must not be claimable again
    const claimedAfter = await outboxRepo.claimBatch({
      batchSize: 10,
      workerId: "test-worker-2",
      lockDurationMs: 15_000,
      now: Date.now(),
    });

    expect(claimedAfter.find((r) => r.id === event1.id)).toBeUndefined();
  });

  it("publishes and subscribes events in the RealtimeHub with topic & wildcard routing", () => {
    const hub = getRealtimeHub();

    const receivedEvents: any[] = [];
    const unsubscribe = hub.subscribe(["tickets", "ticket:*"], (event) => {
      receivedEvents.push(event);
    });

    hub.publish("tickets", {
      id: "evt_1",
      topic: "tickets",
      type: "ticket.created",
      clientId: "cli_1",
      payload: { id: "tkt_1" },
      timestamp: Date.now(),
    });

    hub.publish("ticket:tkt_2", {
      id: "evt_2",
      topic: "ticket:tkt_2",
      type: "ticket.message_added",
      clientId: "cli_1",
      payload: { message: "Hello" },
      timestamp: Date.now(),
    });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].type).toBe("ticket.created");
    expect(receivedEvents[1].type).toBe("ticket.message_added");

    unsubscribe();

    hub.publish("tickets", {
      id: "evt_3",
      topic: "tickets",
      type: "ticket.closed",
      clientId: "cli_1",
      payload: {},
      timestamp: Date.now(),
    });

    expect(receivedEvents).toHaveLength(2); // no new events after unsubscribe
  });
});
