import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RapidShiftClient } from '../src/client';

describe('RapidShiftClient', () => {
  const secretKey = 'rsk_live_test_1234567890abcdef';
  const baseUrl = 'https://api.rapidshift.test';

  it('throws an error if secretKey is missing', () => {
    expect(() => new RapidShiftClient({ secretKey: '' })).toThrow(/secretKey/);
  });

  describe('Successful status fetch', () => {
    it('fetches access status with Bearer and X-Api-Key headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              allowed: true,
              state: 'active',
              rapidshiftStatus: 'online',
              token: 'fake.jwt.token',
              client: { id: 'cli_1', name: 'Acme Corp' },
              cachedUntil: Date.now() + 60000,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();

      const firstCall = mockFetch.mock.calls[0]!;
      const url = firstCall[0];
      const init = firstCall[1];
      expect(url).toBe('https://api.rapidshift.test/api/v1/access/status');
      expect(init.headers.Authorization).toBe(`Bearer ${secretKey}`);
      expect(init.headers['X-Api-Key']).toBe(secretKey);

      expect(result.allowed).toBe(true);
      expect(result.state).toBe('active');
      expect(result.rapidshiftStatus).toBe('online');
      expect(result.token).toBe('fake.jwt.token');
      expect(result.client?.id).toBe('cli_1');
    });
  });

  describe('In-memory caching', () => {
    it('returns cached entry on subsequent calls without making additional network requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              allowed: true,
              state: 'active',
              rapidshiftStatus: 'online',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        cacheTtlSeconds: 60,
        fetch: mockFetch as any,
      });

      // 5 consecutive requests
      const res1 = await client.getAccessStatus();
      const res2 = await client.getAccessStatus();
      const res3 = await client.getAccessStatus();
      const res4 = await client.getAccessStatus();
      const res5 = await client.getAccessStatus();

      expect(mockFetch).toHaveBeenCalledTimes(1); // EXACTLY ONCE
      expect(res1.allowed).toBe(true);
      expect(res2.allowed).toBe(true);
      expect(res3.allowed).toBe(true);
      expect(res4.allowed).toBe(true);
      expect(res5.allowed).toBe(true);
    });

    it('forces new network call when bypassCache: true is set', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              allowed: true,
              state: 'active',
              rapidshiftStatus: 'online',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        cacheTtlSeconds: 60,
        fetch: mockFetch as any,
      });

      await client.getAccessStatus();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await client.getAccessStatus({ bypassCache: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Entitlement States handling', () => {
    it('handles blocked status correctly (returns allowed: false)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              allowed: false,
              state: 'blocked',
              rapidshiftStatus: 'online',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();
      expect(result.allowed).toBe(false);
      expect(result.state).toBe('blocked');
      expect(result.rapidshiftStatus).toBe('online');
    });

    it('handles overdue status correctly (returns allowed: true, state: overdue in grace period)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              allowed: true,
              state: 'overdue',
              rapidshiftStatus: 'online',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();
      expect(result.allowed).toBe(true);
      expect(result.state).toBe('overdue');
      expect(result.rapidshiftStatus).toBe('online');
    });

    it('handles suspended status correctly (returns allowed: false, state: suspended)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              allowed: false,
              state: 'suspended',
              rapidshiftStatus: 'online',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();
      expect(result.allowed).toBe(false);
      expect(result.state).toBe('suspended');
    });
  });

  describe('Fail-Open Semantics', () => {
    it('fails open on network error (fetch rejects -> returns allowed: true, rapidshiftStatus: offline)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3000'));

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        failMode: 'open',
        fetch: mockFetch as any,
      });

      // Must NOT throw
      const result = await client.getAccessStatus();

      expect(result.allowed).toBe(true);
      expect(result.state).toBe('unknown');
      expect(result.rapidshiftStatus).toBe('offline');
      expect(result.error).toContain('ECONNREFUSED');
      expect(client.getPlatformStatus()).toBe('offline');
    });

    it('fails open on timeout (simulated delayed fetch -> aborts and returns allowed: true, offline)', async () => {
      // Simulate slow response that takes 100ms when timeout is 20ms
      const mockFetch = vi.fn().mockImplementation((_url: string, { signal }: { signal: AbortSignal }) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(new Response(JSON.stringify({ data: { allowed: true } })));
          }, 100);

          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        timeoutMs: 25,
        failMode: 'open',
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();

      expect(result.allowed).toBe(true);
      expect(result.state).toBe('unknown');
      expect(result.rapidshiftStatus).toBe('offline');
      expect(result.error).toMatch(/timed out|aborted/i);
      expect(client.getPlatformStatus()).toBe('offline');
    });

    it('fails open on HTTP 500 / 502 / 503 server error', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        failMode: 'open',
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();

      expect(result.allowed).toBe(true);
      expect(result.state).toBe('unknown');
      expect(result.rapidshiftStatus).toBe('offline');
      expect(result.error).toContain('500');
    });

    it('denies access in failMode: closed when network error occurs', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        failMode: 'closed',
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();

      expect(result.allowed).toBe(false);
      expect(result.state).toBe('unknown');
      expect(result.rapidshiftStatus).toBe('offline');
    });
  });

  describe('Authentication errors (401 / 403)', () => {
    it('returns allowed: false when API key is unauthorized or invalid (401)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'unauthorized',
              message: 'Invalid, revoked, or expired API key',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl,
        failMode: 'open', // Even in fail-open mode, 401 is unauthorized
        fetch: mockFetch as any,
      });

      const result = await client.getAccessStatus();

      expect(result.allowed).toBe(false);
      expect(result.state).toBe('unauthorized');
      expect(result.rapidshiftStatus).toBe('online');
      expect(result.error).toContain('Invalid, revoked, or expired');
    });
  });
});
