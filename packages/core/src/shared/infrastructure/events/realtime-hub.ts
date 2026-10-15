import { EventEmitter } from "node:events";

export interface RealtimeEvent<T = unknown> {
  id: string;
  topic: string; // e.g. "tickets", "ticket:tkt_01J...", "billing:cli_01J..."
  type: string; // e.g. "ticket.message_created", "invoice.issued"
  clientId?: string | null;
  payload: T;
  timestamp: number;
}

export type RealtimeSubscriber = (event: RealtimeEvent) => void;

export class RealtimeHub {
  private readonly emitter: EventEmitter;
  private subscriberCount = 0;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(2000); // Support high concurrent UI connections
  }

  /**
   * Publishes an event to a specific topic and general wildcard topic.
   */
  publish(topic: string, event: RealtimeEvent): void {
    // Exact topic emit
    this.emitter.emit(topic, event);

    // Wildcard channel emit (e.g. "ticket:123" also emits to "ticket:*")
    const prefix = topic.split(":")[0];
    if (prefix && prefix !== topic) {
      this.emitter.emit(`${prefix}:*`, event);
    }

    // Global administrative stream
    this.emitter.emit("*", event);
  }

  /**
   * Subscribes a listener to a set of topics.
   * Returns an unsubscribe function.
   */
  subscribe(topics: string[], handler: RealtimeSubscriber): () => void {
    this.subscriberCount++;

    for (const topic of topics) {
      this.emitter.on(topic, handler);
    }

    return () => {
      this.subscriberCount = Math.max(0, this.subscriberCount - 1);
      for (const topic of topics) {
        this.emitter.off(topic, handler);
      }
    };
  }

  getActiveSubscriberCount(): number {
    return this.subscriberCount;
  }
}

// Global in-process singleton
const GLOBAL_HUB_KEY = Symbol.for("rsl.realtime.hub");
type GlobalWithHub = typeof globalThis & { [GLOBAL_HUB_KEY]?: RealtimeHub };

export function getRealtimeHub(): RealtimeHub {
  const g = globalThis as GlobalWithHub;
  if (!g[GLOBAL_HUB_KEY]) {
    g[GLOBAL_HUB_KEY] = new RealtimeHub();
  }
  return g[GLOBAL_HUB_KEY];
}
