export interface LRUCacheOptions {
  max?: number;
  defaultTtlMs?: number;
}

interface LRUNode<K, V> {
  key: K;
  value: V;
  expiresAt: number;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

export class LRUCache<K, V> {
  private readonly max: number;
  private readonly defaultTtlMs: number;
  private readonly map = new Map<K, LRUNode<K, V>>();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;

  constructor(options?: LRUCacheOptions) {
    this.max = options?.max ?? 5000;
    this.defaultTtlMs = options?.defaultTtlMs ?? 10_000; // 10s default TTL
  }

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) {
      return undefined;
    }

    if (node.expiresAt > 0 && Date.now() > node.expiresAt) {
      this.removeNode(node);
      this.map.delete(key);
      return undefined;
    }

    this.moveToHead(node);
    return node.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    const existing = this.map.get(key);

    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      this.moveToHead(existing);
      return;
    }

    if (this.map.size >= this.max) {
      this.evictTail();
    }

    const newNode: LRUNode<K, V> = {
      key,
      value,
      expiresAt,
      prev: null,
      next: null,
    };

    this.addToHead(newNode);
    this.map.set(key, newNode);
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  private addToHead(node: LRUNode<K, V>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: LRUNode<K, V>): void {
    if (this.head === node) return;
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictTail(): void {
    if (!this.tail) return;
    const oldTail = this.tail;
    this.removeNode(oldTail);
    this.map.delete(oldTail.key);
  }
}

export type GateAccessState = "active" | "overdue" | "blocked" | "suspended";

export type GateTierStatus = "allowed" | "grace_period" | "restricted" | "blocked";

export interface GateStatusResponseData {
  status?: GateTierStatus | string;
  allowed: boolean;
  state: GateAccessState;
  rapidshiftStatus: "online";
  token: string;
  client: { id: string };
  cachedUntil: number;
  expiresAt?: number;
  daysOverdue?: number;
  graceDaysRemaining?: number;
  amountDuePaise?: number;
  restrictedPrefixes?: string[];
  warningMessage?: string;
}

export interface GateStatusEnvelope {
  data: GateStatusResponseData;
}

// Global in-memory cache singleton for gate requests
let globalGateCache: LRUCache<string, GateStatusEnvelope> | null = null;

export function getGateCache(): LRUCache<string, GateStatusEnvelope> {
  if (!globalGateCache) {
    globalGateCache = new LRUCache<string, GateStatusEnvelope>({
      max: 10_000,
      defaultTtlMs: 10_000, // 10 seconds TTL
    });
  }
  return globalGateCache;
}

export function clearGateCache(): void {
  if (globalGateCache) {
    globalGateCache.clear();
  }
}
