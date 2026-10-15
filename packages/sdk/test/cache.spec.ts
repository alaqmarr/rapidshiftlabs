import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCache } from '../src/cache';

describe('InMemoryCache (TTL & SWR)', () => {
  let cache: InMemoryCache<string>;

  beforeEach(() => {
    cache = new InMemoryCache<string>({ ttlSeconds: 10, swrSeconds: 20 });
  });

  it('stores and retrieves cached data within TTL', () => {
    const now = 1000;
    cache.set('key1', 'val1', 10, 20, now);

    expect(cache.get('key1', { now: now + 5000 })).toBe('val1');
    expect(cache.isFresh('key1', now + 5000)).toBe(true);
    expect(cache.isStale('key1', now + 5000)).toBe(false);
  });

  it('returns null when entry has expired past TTL without allowStale', () => {
    const now = 1000;
    cache.set('key1', 'val1', 10, 20, now);

    // After 11s (TTL is 10s)
    expect(cache.get('key1', { now: now + 11000 })).toBeNull();
    expect(cache.isFresh('key1', now + 11000)).toBe(false);
    expect(cache.isStale('key1', now + 11000)).toBe(true);
  });

  it('returns data when in SWR window with allowStale: true', () => {
    const now = 1000;
    cache.set('key1', 'val1', 10, 20, now); // expires at now+10s, stale until now+30s

    // At 15s (expired but in SWR window)
    expect(cache.get('key1', { now: now + 15000, allowStale: true })).toBe('val1');
    expect(cache.isStale('key1', now + 15000)).toBe(true);
  });

  it('purges and returns null past SWR window even with allowStale: true', () => {
    const now = 1000;
    cache.set('key1', 'val1', 10, 20, now); // stale until now+30s

    // At 35s (completely expired)
    expect(cache.get('key1', { now: now + 35000, allowStale: true })).toBeNull();
    expect(cache.has('key1', now + 35000)).toBe(false);
  });

  it('evicts oldest entry when maxSize is reached', () => {
    const smallCache = new InMemoryCache<string>({ maxSize: 2 });
    smallCache.set('a', 'alpha');
    smallCache.set('b', 'beta');
    expect(smallCache.size).toBe(2);

    smallCache.set('c', 'gamma');
    expect(smallCache.size).toBe(2);
    expect(smallCache.get('a')).toBeNull(); // evicted
    expect(smallCache.get('b')).toBe('beta');
    expect(smallCache.get('c')).toBe('gamma');
  });

  it('deletes and clears entries', () => {
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    expect(cache.size).toBe(2);

    expect(cache.delete('k1')).toBe(true);
    expect(cache.get('k1')).toBeNull();
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('k2')).toBeNull();
  });

  it('retrieves raw CacheEntry with metadata', () => {
    const now = 5000;
    const entry = cache.set('k1', 'v1', 60, 120, now);

    expect(entry.data).toBe('v1');
    expect(entry.cachedAt).toBe(5000);
    expect(entry.expiresAt).toBe(5000 + 60000);
    expect(entry.staleUntil).toBe(5000 + 60000 + 120000);

    const retrieved = cache.getEntry('k1');
    expect(retrieved).toEqual(entry);
  });
});
