import { describe, it, expect, vi } from 'vitest';
import {
  RapidShiftClient,
  createGate,
  InMemoryCache,
  type GateResult,
  type AccessStatusResponse,
} from '../src/index';

describe('End-to-End Client Lifecycle & 3-Stage Tiered Gate Integration', () => {
  const secretKey = 'rsk_live_e2e_integration_key';

  it('verifies all public package index exports are defined', () => {
    expect(RapidShiftClient).toBeDefined();
    expect(createGate).toBeDefined();
    expect(InMemoryCache).toBeDefined();
  });

  it('simulates full 3-stage lifecycle: active -> grace_period -> restricted -> blocked -> recovered -> server crash fail-open', async () => {
    let serverStage: 'active' | 'grace_period' | 'restricted' | 'blocked' = 'active';
    let serverOnline = true;
    let fetchCount = 0;

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCount++;
      if (!serverOnline) {
        throw new Error('Connection refused: RapidShift server is stopped');
      }

      if (serverStage === 'active') {
        return new Response(
          JSON.stringify({
            data: {
              status: 'allowed',
              allowed: true,
              state: 'active',
              rapidshiftStatus: 'online',
              token: 'active_token',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (serverStage === 'grace_period') {
        return new Response(
          JSON.stringify({
            data: {
              status: 'grace_period',
              allowed: true,
              state: 'overdue',
              rapidshiftStatus: 'online',
              daysOverdue: 2,
              graceDaysRemaining: 1,
              amountDuePaise: 500000,
              warningMessage: 'Invoice is 2 days overdue. Grace period active (1 day remaining).',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (serverStage === 'restricted') {
        return new Response(
          JSON.stringify({
            data: {
              status: 'restricted',
              allowed: true,
              state: 'overdue',
              rapidshiftStatus: 'online',
              daysOverdue: 5,
              amountDuePaise: 500000,
              restrictedPrefixes: ['/admin', '/api/admin'],
              warningMessage: 'Account restricted due to 5 days overdue invoice. Admin routes blocked.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (serverStage === 'blocked') {
        return new Response(
          JSON.stringify({
            data: {
              status: 'blocked',
              allowed: false,
              state: 'blocked',
              rapidshiftStatus: 'online',
              daysOverdue: 10,
              amountDuePaise: 500000,
              warningMessage: 'Account suspended. All routes blocked.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not found', { status: 404 });
    });

    const client = new RapidShiftClient({
      secretKey,
      baseUrl: 'http://localhost:3000',
      cacheTtlSeconds: 60,
      failMode: 'open',
      fetch: mockFetch as any,
    });

    const gate = createGate({
      secretKey,
      client,
      paymentUrl: 'http://localhost:3000/payment-due',
    });

    // -------------------------------------------------------------
    // Step 1: Active Client
    // -------------------------------------------------------------
    const req1 = new Request('http://localhost:3000/dashboard');
    const res1 = (await gate(req1)) as GateResult;
    expect(res1.allowed).toBe(true);
    expect(res1.status).toBe('allowed');
    expect(fetchCount).toBe(1);

    // -------------------------------------------------------------
    // Step 2: Served from cache
    // -------------------------------------------------------------
    const req2 = new Request('http://localhost:3000/dashboard/reports');
    const res2 = (await gate(req2)) as GateResult;
    expect(res2.allowed).toBe(true);
    expect(fetchCount).toBe(1); // Cached!

    // -------------------------------------------------------------
    // Step 3: Stage 1 (Days 1–3 Overdue: Grace Period)
    // -------------------------------------------------------------
    serverStage = 'grace_period';
    client.clearCache();

    // 3a. Public route: allowed, banner attached
    const reqPublicGrace = new Request('http://localhost:3000/products/gadget');
    const resPublicGrace = (await gate(reqPublicGrace)) as GateResult;
    expect(resPublicGrace.allowed).toBe(true);
    expect(resPublicGrace.status).toBe('grace_period');
    expect(resPublicGrace.graceDaysRemaining).toBe(1);
    expect(resPublicGrace.headers?.['x-rsl-grace-banner']).toBeDefined();

    const bannerDetails = JSON.parse(resPublicGrace.headers?.['x-rsl-grace-banner'] || '{}');
    expect(bannerDetails.daysOverdue).toBe(2);
    expect(bannerDetails.graceDaysRemaining).toBe(1);
    expect(bannerDetails.amountDuePaise).toBe(500000);

    // 3b. Admin route: ALSO 100% operational during Stage 1
    const reqAdminGrace = new Request('http://localhost:3000/admin/settings');
    const resAdminGrace = (await gate(reqAdminGrace)) as GateResult;
    expect(resAdminGrace.allowed).toBe(true);
    expect(resAdminGrace.status).toBe('grace_period');

    // -------------------------------------------------------------
    // Step 4: Stage 2 (Days 4–7 Overdue: Restricted Mode)
    // -------------------------------------------------------------
    serverStage = 'restricted';
    client.clearCache();

    // 4a. Public customer-facing route remains open
    const reqPublicRestricted = new Request('http://localhost:3000/products/catalog');
    const resPublicRestricted = (await gate(reqPublicRestricted)) as GateResult;
    expect(resPublicRestricted.allowed).toBe(true);
    expect(resPublicRestricted.status).toBe('restricted');

    // 4b. Admin route is blocked with HTTP 307 redirect
    const reqAdminRestricted = new Request('http://localhost:3000/admin/dashboard');
    const resAdminRestricted = await gate(reqAdminRestricted);
    expect(resAdminRestricted).toBeInstanceOf(Response);
    expect((resAdminRestricted as Response).status).toBe(307);
    expect((resAdminRestricted as Response).headers.get('Location')).toBe('http://localhost:3000/payment-due');
    expect((resAdminRestricted as any).allowed).toBe(false);
    expect((resAdminRestricted as any).gateStatus).toBe('restricted');

    // -------------------------------------------------------------
    // Step 5: Stage 3 (Day 8+ Overdue: Strict Gate / Blocked)
    // -------------------------------------------------------------
    serverStage = 'blocked';
    client.clearCache();

    // 5a. Public route is now blocked
    const reqPublicBlocked = new Request('http://localhost:3000/products/catalog');
    const resPublicBlocked = await gate(reqPublicBlocked);
    expect(resPublicBlocked).toBeInstanceOf(Response);
    expect((resPublicBlocked as Response).status).toBe(307);
    expect((resPublicBlocked as Response).headers.get('Location')).toBe('http://localhost:3000/payment-due');

    // 5b. Admin route is also blocked
    const reqAdminBlocked = new Request('http://localhost:3000/admin/users');
    const resAdminBlocked = await gate(reqAdminBlocked);
    expect(resAdminBlocked).toBeInstanceOf(Response);
    expect((resAdminBlocked as Response).status).toBe(307);

    // -------------------------------------------------------------
    // Step 6: Payment Settled -> Back to Active
    // -------------------------------------------------------------
    serverStage = 'active';
    client.clearCache();

    const reqRecovered = new Request('http://localhost:3000/dashboard');
    const resRecovered = (await gate(reqRecovered)) as GateResult;
    expect(resRecovered.allowed).toBe(true);
    expect(resRecovered.status).toBe('allowed');

    // -------------------------------------------------------------
    // Step 7: RapidShift Control Plane Down -> Fail-Open Resilience
    // -------------------------------------------------------------
    serverOnline = false;
    client.clearCache();

    const reqFailOpen = new Request('http://localhost:3000/dashboard');
    const resFailOpen = (await gate(reqFailOpen)) as GateResult;
    expect(resFailOpen.allowed).toBe(true);
    expect(resFailOpen.rapidshiftStatus).toBe('offline');
    expect(client.getPlatformStatus()).toBe('offline');
  });
});
