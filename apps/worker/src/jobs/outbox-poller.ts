import { getRealtimeHub } from "@rsl/core/events";
import {
  type EventOutboxRepository,
  type OutboxRecord,
} from "@rsl/core/events";
import { getContainer } from "@rsl/core/container";

export interface OutboxPollerOptions {
  workerId: string;
  pollIntervalMs?: number; // default 1000ms
  batchSize?: number; // default 50
  lockDurationMs?: number; // default 30000ms
  maxRetries?: number; // default 5
  baseBackoffMs?: number; // default 2000ms
  maxBackoffMs?: number; // default 60000ms
}

export type EventHandler = (event: OutboxRecord) => Promise<void>;

export class OutboxPoller {
  private isRunning = false;
  private loopTimer: NodeJS.Timeout | null = null;
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly realtimeHub = getRealtimeHub();

  constructor(
    private readonly outboxRepo: EventOutboxRepository,
    private readonly options: OutboxPollerOptions,
  ) {}

  registerHandler(eventType: string, handler: EventHandler): void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `[OutboxPoller] Started polling with interval ${this.options.pollIntervalMs ?? 1000}ms`,
    );
    void this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;
    try {
      this.loopTimer = setTimeout(() => {
        void this.pollCycle().catch((err) => {
          console.error("[OutboxPoller] Unhandled rejection in pollCycle:", err);
        });
      }, delayMs);
      this.loopTimer.unref();
    } catch (schedErr) {
      console.error("[OutboxPoller] Error scheduling next cycle:", schedErr);
    }
  }

  private async pollCycle(): Promise<void> {
    if (!this.isRunning) return;

    const now = Date.now();
    const batchSize = this.options.batchSize ?? 50;
    const lockDurationMs = this.options.lockDurationMs ?? 30_000;
    let processedCount = 0;

    try {
      // 1. Claim batch with lease
      const records = await this.outboxRepo.claimBatch({
        batchSize,
        workerId: this.options.workerId,
        lockDurationMs,
        now,
      });

      processedCount = records.length;

      // 2. Process each event in the claimed batch with individual error boundary
      for (const record of records) {
        if (!this.isRunning) break;
        try {
          await this.processRecord(record);
        } catch (recordErr) {
          console.error(
            `[OutboxPoller] Unexpected error processing outbox record ${record.id} (${record.type}):`,
            recordErr,
          );
        }
      }
    } catch (err) {
      console.error("[OutboxPoller] Error during poll cycle:", err);
    } finally {
      // 3. Adaptive scheduling: If we had a full batch, drain immediately; otherwise wait interval
      if (this.isRunning) {
        const nextDelay =
          processedCount >= batchSize
            ? 0
            : (this.options.pollIntervalMs ?? 1_000);
        this.scheduleNext(nextDelay);
      }
    }
  }

  private async processRecord(record: OutboxRecord): Promise<void> {
    const now = Date.now();
    const maxRetries = this.options.maxRetries ?? 5;
    const baseBackoffMs = this.options.baseBackoffMs ?? 2_000;
    const maxBackoffMs = this.options.maxBackoffMs ?? 60_000;

    try {
      // A. Dispatch to in-process Realtime Hub (SSE) for instant UI updates
      let parsedPayload: Record<string, unknown> = {};
      try {
        parsedPayload = JSON.parse(record.payload);
      } catch {}

      try {
        this.realtimeHub.publish(record.aggregateType, {
          id: record.id,
          topic: record.aggregateType,
          type: record.type,
          clientId: record.clientId,
          payload: parsedPayload,
          timestamp: record.occurredAt,
        });

        if (record.clientId) {
          this.realtimeHub.publish(`client:${record.clientId}`, {
            id: record.id,
            topic: `client:${record.clientId}`,
            type: record.type,
            clientId: record.clientId,
            payload: parsedPayload,
            timestamp: record.occurredAt,
          });
        }

        // Specific instance topic (e.g. "ticket:tkt_123")
        this.realtimeHub.publish(`${record.aggregateType}:${record.aggregateId}`, {
          id: record.id,
          topic: `${record.aggregateType}:${record.aggregateId}`,
          type: record.type,
          clientId: record.clientId,
          payload: parsedPayload,
          timestamp: record.occurredAt,
        });
      } catch (hubErr) {
        console.warn(`[OutboxPoller] RealtimeHub broadcast warning for ${record.id}:`, hubErr);
      }

      // B. Invoke registered domain/subscriber handlers
      const matchedHandlers = [
        ...(this.handlers.get(record.type) || []),
        ...(this.handlers.get("*") || []),
      ];

      for (const handler of matchedHandlers) {
        await handler(record);
      }

      // C. Mark published
      await this.outboxRepo.markPublished(record.id, now);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      const newAttempts = record.attempts + 1;

      // Exponential backoff with full jitter
      const exponentialDelay = Math.min(
        maxBackoffMs,
        baseBackoffMs * Math.pow(2, newAttempts - 1),
      );
      const jitter = Math.floor(Math.random() * (exponentialDelay * 0.2));
      const nextRetryAt = now + exponentialDelay + jitter;

      console.warn(
        `[OutboxPoller] Event ${record.id} (${record.type}) failed (attempt ${newAttempts}/${maxRetries}): ${errorMessage}`,
      );

      try {
        await this.outboxRepo.markFailed({
          id: record.id,
          error: errorMessage,
          attempts: newAttempts,
          maxAttempts: maxRetries,
          nextRetryAt: newAttempts >= maxRetries ? null : nextRetryAt,
          failedAt: now,
        });
      } catch (markErr) {
        console.error(
          `[OutboxPoller] Fatal: Could not mark failed status for record ${record.id}:`,
          markErr,
        );
      }
    }
  }
}

export function startOutboxPoller(options?: Partial<OutboxPollerOptions>): OutboxPoller {
  const container = getContainer();
  const workerId =
    options?.workerId ?? `worker-${process.pid}-${Date.now().toString(36)}`;
  const poller = new OutboxPoller(container.outboxRepo, {
    workerId,
    pollIntervalMs: options?.pollIntervalMs ?? 1_000,
    batchSize: options?.batchSize ?? 50,
    lockDurationMs: options?.lockDurationMs ?? 30_000,
    maxRetries: options?.maxRetries ?? 5,
  });
  poller.start();
  return poller;
}
