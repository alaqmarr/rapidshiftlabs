import { newId } from "./id";

/**
 * Domain events are facts that happened inside an aggregate.
 * They are persisted to the transactional outbox in the SAME write transaction
 * as the state change, then:
 *   - tailed by the portal to push realtime SSE updates, and
 *   - dispatched by the worker to durable handlers (email, webhooks, cross-context reactions).
 */
export interface DomainEvent<TType extends string = string, TPayload = any> {
  id: string;
  type: TType;
  aggregateType: string;
  aggregateId: string;
  /** Owning client (tenant) if any. Used for realtime topic filtering and webhooks. */
  clientId: string | null;
  payload: TPayload;
  occurredAt: number;
}

export function createEvent<TType extends string, TPayload extends object = Record<string, unknown>>(
  type: TType,
  input: { aggregateType: string; aggregateId: string; clientId?: string | null; payload: TPayload },
): DomainEvent<TType, TPayload> {
  return {
    id: newId("evt"),
    type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    clientId: input.clientId ?? null,
    payload: input.payload,
    occurredAt: Date.now(),
  };
}

/** Base class for aggregates: collects events raised during a use case. */
export abstract class AggregateRoot<TProps> {
  protected _events: DomainEvent<string, any>[] = [];

  protected constructor(protected props: TProps) {}

  protected raise(event: DomainEvent<string, any>) {
    this._events.push(event);
  }

  pullEvents(): DomainEvent<string, any>[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  /** Snapshot of the current state (used by repositories / mappers). */
  toState(): Readonly<TProps> {
    return Object.freeze({ ...this.props });
  }
}
