import { describe, it, expect, vi } from 'vitest';
import defaultGate, { createGate, createNextGate } from '../src/next';

describe('Next.js Gate Integration (@rapidshift/sdk/next)', () => {
  const secretKey = 'rsk_live_proxy_test';

  it('exports createGate and createNextGate as named exports and default export', () => {
    expect(createGate).toBeDefined();
    expect(createNextGate).toBeDefined();
    expect(defaultGate).toBe(createGate);
  });

  describe('Active & Allowed Pass-through', () => {
    it('passes through seamlessly when client is active', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'allowed',
              allowed: true,
              state: 'active',
              rapidshiftStatus: 'online',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const proxy = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/app/overview');
      const res: any = await proxy(req);

      expect(res.allowed).toBe(true);
      expect(res.status).toBe('allowed');
      expect(res.state).toBe('active');
    });
  });

  describe('Stage 1: Grace Period (Days 1–3 Overdue)', () => {
    it('allows access to public and admin routes with x-rsl-grace-banner attached in headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'grace_period',
              allowed: true,
              state: 'overdue',
              rapidshiftStatus: 'online',
              daysOverdue: 2,
              graceDaysRemaining: 1,
              amountDuePaise: 350000,
              warningMessage: 'Invoice overdue by 2 days. 1 day left in grace period.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const proxy = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      // Public route
      const publicReq = new Request('http://localhost:3000/shop/items');
      const publicRes: any = await proxy(publicReq);

      expect(publicRes.allowed).toBe(true);
      expect(publicRes.status).toBe('grace_period');
      expect(publicRes.headers?.['x-rsl-grace-banner']).toBeDefined();
      const banner = JSON.parse(publicRes.headers['x-rsl-grace-banner']);
      expect(banner.graceDaysRemaining).toBe(1);
      expect(banner.daysOverdue).toBe(2);
      expect(banner.amountDuePaise).toBe(350000);

      // Admin route also remains accessible in Stage 1
      const adminReq = new Request('http://localhost:3000/admin/settings');
      const adminRes: any = await proxy(adminReq);
      expect(adminRes.allowed).toBe(true);
      expect(adminRes.status).toBe('grace_period');
      expect(adminRes.graceBanner?.graceDaysRemaining).toBe(1);
    });
  });

  describe('Stage 2: Restricted Mode (Days 4–7 Overdue)', () => {
    const restrictedPayload = {
      data: {
        status: 'restricted',
        allowed: true,
        state: 'overdue',
        rapidshiftStatus: 'online',
        daysOverdue: 5,
        amountDuePaise: 750000,
        restrictedPrefixes: ['/admin', '/api/admin'],
        warningMessage: 'Restricted mode active. Administrative endpoints are disabled until payment is made.',
      },
    };

    it('permits public routes (/, /shop, /api/public) to continue', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const proxy = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/shop/checkout');
      const res: any = await proxy(req);

      expect(res.allowed).toBe(true);
      expect(res.status).toBe('restricted');
    });

    it('blocks administrative routes and redirects with HTTP 307 to payment settlement page', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const proxy = createGate({
        secretKey,
        paymentUrl: 'http://localhost:3000/billing/pay',
        fetch: mockFetch as any,
      });

      const adminReq = new Request('http://localhost:3000/admin/users');
      const res = await proxy(adminReq);

      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(307);
      expect((res as Response).headers.get('Location')).toBe('http://localhost:3000/billing/pay');
      expect((res as any).allowed).toBe(false);
      expect((res as any).gateStatus).toBe('restricted');
    });

    it('supports custom adminPrefixes in Next.js proxy', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const proxy = createGate({
        secretKey,
        adminPrefixes: ['/internal-admin'],
        blockedPage: '/settle-dues',
        fetch: mockFetch as any,
      });

      // Internal admin is blocked
      const internalAdminReq = new Request('http://localhost:3000/internal-admin/analytics');
      const resBlocked = await proxy(internalAdminReq);
      expect(resBlocked).toBeInstanceOf(Response);
      expect((resBlocked as Response).status).toBe(307);
      expect((resBlocked as Response).headers.get('Location')).toBe('http://localhost:3000/settle-dues');

      // Default /admin is treated as public route because adminPrefixes was customized
      const defaultAdminReq = new Request('http://localhost:3000/admin');
      const resAllowed: any = await proxy(defaultAdminReq);
      expect(resAllowed.allowed).toBe(true);
    });
  });

  describe('Stage 3: Strict Gate / Blocked (Day 8+ Overdue or Suspended)', () => {
    it('redirects all routes with HTTP 307 when client is blocked', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'blocked',
              allowed: false,
              state: 'blocked',
              rapidshiftStatus: 'online',
              daysOverdue: 9,
              amountDuePaise: 900000,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const proxy = createGate({
        secretKey,
        blockedPage: '/payment-due',
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/app/overview');
      const res = await proxy(req);

      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(307);
      expect((res as Response).headers.get('Location')).toBe('http://localhost:3000/payment-due');
      expect((res as any).allowed).toBe(false);
      expect((res as any).gateStatus).toBe('blocked');
    });
  });

  describe('Fail-Open Offline Resilience', () => {
    it('passes through in proxy.ts when API is offline (fail-open default)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network drop'));

      const proxy = createGate({
        secretKey,
        failMode: 'open',
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/app/overview');
      const res = await proxy(req);

      expect((res as any).allowed).toBe(true);
      expect((res as any).rapidshiftStatus).toBe('offline');
    });
  });
});
