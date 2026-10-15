import { describe, it, expect, vi } from 'vitest';
import { createExpressGate } from '../src/express';

describe('Express Middleware Adapter (createExpressGate)', () => {
  const secretKey = 'rsk_live_express_test';

  describe('Active & Allowed Pass-through', () => {
    it('calls next() and attaches rapidshift result when access is allowed', async () => {
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

      const middleware = createExpressGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const req: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/dashboard',
        method: 'GET',
        headers: {},
      };
      const res = {
        redirect: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(req.rapidshift?.allowed).toBe(true);
      expect(req.rapidshift?.status).toBe('allowed');
      expect(req.rapidshift?.state).toBe('active');
    });
  });

  describe('Stage 1: Grace Period (Days 1–3 Overdue)', () => {
    it('calls next() and attaches x-rsl-grace-banner header & req properties', async () => {
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
              amountDuePaise: 500000,
              warningMessage: 'Invoice payment is 2 days overdue. 1 day remaining in grace period.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const middleware = createExpressGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const req: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/products',
        method: 'GET',
        headers: {},
      };
      const res = {
        redirect: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith(
        'x-rsl-grace-banner',
        expect.stringContaining('"graceDaysRemaining":1')
      );
      expect(req['x-rsl-grace-banner']).toBeDefined();
      const banner = JSON.parse(req['x-rsl-grace-banner']);
      expect(banner.graceDaysRemaining).toBe(1);
      expect(banner.daysOverdue).toBe(2);
      expect(banner.amountDuePaise).toBe(500000);
      expect(req.rapidshift?.status).toBe('grace_period');
    });

    it('allows admin routes in Stage 1 without redirection', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'grace_period',
              allowed: true,
              state: 'overdue',
              rapidshiftStatus: 'online',
              daysOverdue: 1,
              graceDaysRemaining: 2,
              amountDuePaise: 250000,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const middleware = createExpressGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const req: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/admin/settings',
        method: 'GET',
        headers: {},
      };
      const res = {
        redirect: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('x-rsl-grace-banner', expect.any(String));
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
        amountDuePaise: 800000,
        restrictedPrefixes: ['/admin', '/api/admin'],
        warningMessage: 'Account is in restricted mode due to unpaid invoices. Admin routes are blocked.',
      },
    };

    it('permits public routes to call next() without redirection', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const middleware = createExpressGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const req: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/api/v1/catalog',
        method: 'GET',
        headers: {},
      };
      const res = {
        redirect: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(req.rapidshift?.status).toBe('restricted');
      expect(req.rapidshift?.allowed).toBe(true);
    });

    it('blocks admin routes and redirects to paymentUrl with HTTP 307', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const middleware = createExpressGate({
        secretKey,
        paymentUrl: 'http://localhost:4000/pay-invoice',
        fetch: mockFetch as any,
      });

      const req: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/admin/users',
        method: 'GET',
        headers: {},
      };
      const res = {
        redirect: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(307, 'http://localhost:4000/pay-invoice');
      expect(next).not.toHaveBeenCalled();
    });

    it('supports custom adminPrefixes in Express middleware', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const middleware = createExpressGate({
        secretKey,
        adminPrefixes: ['/custom-portal'],
        blockedPage: '/settle-dues',
        fetch: mockFetch as any,
      });

      // Custom prefix blocked
      const reqBlocked: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/custom-portal/settings',
        method: 'GET',
        headers: {},
      };
      const resBlocked = { redirect: vi.fn(), setHeader: vi.fn() };
      const nextBlocked = vi.fn();

      await middleware(reqBlocked, resBlocked, nextBlocked);
      expect(resBlocked.redirect).toHaveBeenCalledWith(307, 'http://localhost:4000/settle-dues');
      expect(nextBlocked).not.toHaveBeenCalled();

      // Default /admin allowed because custom prefixes replaced it
      const reqAllowed: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/admin',
        method: 'GET',
        headers: {},
      };
      const resAllowed = { redirect: vi.fn(), setHeader: vi.fn() };
      const nextAllowed = vi.fn();

      await middleware(reqAllowed, resAllowed, nextAllowed);
      expect(nextAllowed).toHaveBeenCalledTimes(1);
      expect(resAllowed.redirect).not.toHaveBeenCalled();
    });
  });

  describe('Stage 3: Strict Block (Day 8+ Overdue or Suspended)', () => {
    it('redirects all routes to /payment-due when access is blocked', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'blocked',
              allowed: false,
              state: 'blocked',
              rapidshiftStatus: 'online',
              daysOverdue: 12,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const middleware = createExpressGate({
        secretKey,
        blockedPage: '/payment-due',
        fetch: mockFetch as any,
      });

      const req = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/api/v1/protected-resource',
        method: 'GET',
        headers: {},
      };
      const res = {
        redirect: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(307, 'http://localhost:4000/payment-due');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Fail-open offline resilience', () => {
    it('calls next() and marks rapidshiftStatus as offline when control plane cannot be reached', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network connection drop'));

      const middleware = createExpressGate({
        secretKey,
        failMode: 'open',
        fetch: mockFetch as any,
      });

      const req: any = {
        protocol: 'http',
        get: () => 'localhost:4000',
        originalUrl: '/api/v1/orders',
        method: 'GET',
        headers: {},
      };
      const res = {
        redirect: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(req.rapidshift?.allowed).toBe(true);
      expect(req.rapidshift?.rapidshiftStatus).toBe('offline');
    });
  });
});
