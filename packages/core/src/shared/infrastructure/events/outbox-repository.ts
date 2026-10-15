import { eq, and, or, isNull, lte, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../db/connection-factory";
import { outbox, type OutboxRow } from "../db/schema/outbox";
import type { DomainEvent } from "../../kernel/domain-event";

export interface OutboxRecord extends OutboxRow {}

export interface EventOutboxRepository {
  /**
   * Appends domain events to the outbox table within the provided transaction handle or default db.
   */
  append(events: DomainEvent[], tx?: any): Promise<void>;
  publish(event: DomainEvent, tx?: any): Promise<void>;

  /**
   * Finds pending events and acquires a temporary lease lock.
   */
  claimBatch(options: {
    batchSize: number;
    workerId: string;
    lockDurationMs: number;
    now: number;
  }): Promise<OutboxRecord[]>;

  /**
   * Marks a record as successfully dispatched.
   */
  markPublished(id: string, publishedAt: number): Promise<void>;

  /**
   * Marks an attempt as failed and reschedules with exponential backoff or dead-letters it.
   */
  markFailed(options: {
    id: string;
    error: string;
    attempts: number;
    maxAttempts: number;
    nextRetryAt: number | null;
    failedAt: number;
  }): Promise<void>;
}

export class DrizzleEventOutboxRepository implements EventOutboxRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async append(events: DomainEvent[], tx?: any): Promise<void> {
    if (events.length === 0) return;
    const client = tx ?? this.db;

    const rows = events.map((event) => ({
      id: event.id,
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      clientId: event.clientId ?? null,
      payload: JSON.stringify(event.payload),
      occurredAt: event.occurredAt,
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: event.occurredAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    await client.insert(outbox).values(rows);
  }

  async publish(event: DomainEvent, tx?: any): Promise<void> {
    await this.append([event], tx);
  }

  async claimBatch(options: {
    batchSize: number;
    workerId: string;
    lockDurationMs: number;
    now: number;
  }): Promise<OutboxRecord[]> {
    const expiredLockThreshold = options.now - options.lockDurationMs;

    // Select candidate IDs: either pending with retry due, or processing with expired lock
    const candidates = await this.db
      .select({ id: outbox.id })
      .from(outbox)
      .where(
        or(
          and(
            eq(outbox.status, "pending"),
            or(isNull(outbox.nextRetryAt), lte(outbox.nextRetryAt, options.now)),
          ),
          and(
            eq(outbox.status, "processing"),
            lte(outbox.lockedAt, expiredLockThreshold),
          ),
        ),
      )
      .orderBy(outbox.occurredAt)
      .limit(options.batchSize);

    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);

    // Atomically claim the batch
    await this.db
      .update(outbox)
      .set({
        status: "processing",
        lockedAt: options.now,
        lockedBy: options.workerId,
        updatedAt: options.now,
      })
      .where(inArray(outbox.id, ids));

    // Return the claimed records
    return this.db.select().from(outbox).where(inArray(outbox.id, ids));
  }

  async markPublished(id: string, publishedAt: number): Promise<void> {
    await this.db
      .update(outbox)
      .set({
        status: "published",
        processedAt: publishedAt,
        lockedAt: null,
        lockedBy: null,
        updatedAt: publishedAt,
      })
      .where(eq(outbox.id, id));
  }

  async markFailed(options: {
    id: string;
    error: string;
    attempts: number;
    maxAttempts: number;
    nextRetryAt: number | null;
    failedAt: number;
  }): Promise<void> {
    const isDeadLetter = options.attempts >= options.maxAttempts;
    await this.db
      .update(outbox)
      .set({
        status: isDeadLetter ? "failed" : "pending",
        attempts: options.attempts,
        nextRetryAt: isDeadLetter ? null : options.nextRetryAt,
        lastError: options.error,
        lockedAt: null,
        lockedBy: null,
        processedAt: isDeadLetter ? options.failedAt : null,
        updatedAt: options.failedAt,
      })
      .where(eq(outbox.id, options.id));
  }
}
