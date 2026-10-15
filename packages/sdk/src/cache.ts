import type { CacheEntry, CacheOptions } from './types';

/**
 * High-performance, Edge-compatible in-memory cache with TTL and Stale-While-Revalidate (SWR) support.
 * Pure TypeScript with zero binary dependencies.
 */
export class InMemoryCache<T = any> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly defaultSwrMs: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtlMs = (options.ttlSeconds ?? 60) * 1000;
    this.defaultSwrMs = (options.swrSeconds ?? 300) * 1000;
    this.maxSize = options.maxSize ?? 1000;
  }

  /**
   * Retrieves data if present in cache.
   * By default, returns data only if within fresh TTL.
   * If allowStale is true, returns data if within the SWR window.
   */
  get(key: string, options?: { allowStale?: boolean; now?: number }): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const now = options?.now ?? Date.now();

    // Within fresh TTL
    if (now < entry.expiresAt) {
      return entry.data;
    }

    const staleUntil = entry.staleUntil ?? entry.expiresAt;

    // Past stale window -> expired, purge
    if (now >= staleUntil) {
      this.store.delete(key);
      return null;
    }

    // In stale window
    if (options?.allowStale) {
      return entry.data;
    }

    return null;
  }

  /**
   * Returns full cache entry metadata ({ data, cachedAt, expiresAt, staleUntil }).
   */
  getEntry(key: string): CacheEntry<T> | null {
    return this.store.get(key) ?? null;
  }

  /**
   * Checks whether the entry is currently fresh (within TTL).
   */
  isFresh(key: string, now: number = Date.now()): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    return now < entry.expiresAt;
  }

  /**
   * Checks whether the entry is currently stale (expired TTL but still in SWR window).
   */
  isStale(key: string, now: number = Date.now()): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    const staleUntil = entry.staleUntil ?? entry.expiresAt;
    return now >= entry.expiresAt && now < staleUntil;
  }

  /**
   * Stores value with TTL and optional SWR window.
   */
  set(
    key: string,
    data: T,
    ttlSeconds?: number,
    swrSeconds?: number,
    now: number = Date.now()
  ): CacheEntry<T> {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      // Evict oldest entry (Map maintains insertion order)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;
    const swrMs = swrSeconds !== undefined ? swrSeconds * 1000 : this.defaultSwrMs;
    const expiresAt = now + ttlMs;
    const staleUntil = expiresAt + swrMs;

    const entry: CacheEntry<T> = {
      data,
      cachedAt: now,
      expiresAt,
      staleUntil,
    };

    this.store.set(key, entry);
    return entry;
  }

  /**
   * Checks if an entry exists and is not completely expired.
   */
  has(key: string, now: number = Date.now()): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    const staleUntil = entry.staleUntil ?? entry.expiresAt;
    if (now >= staleUntil) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Removes entry by key.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clears entire cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Total number of entries in cache.
   */
  get size(): number {
    return this.store.size;
  }
}

export type GateCache<T = any> = InMemoryCache<T>;
