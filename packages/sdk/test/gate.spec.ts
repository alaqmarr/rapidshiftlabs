import { describe, it, expect, vi } from 'vitest';
import { createGate } from '../src/gate';

describe('createGate (Next.js & Proxy middleware integration)', () => {
  const secretKey = 'rsk_live_test_gate_key';

  describe('Path Exclusions', () => {
    it('bypasses gate check for default excluded routes (/_next, /favicon.ico, /payment-due, /api/health)', async () => {
      const mockFetch = vi.fn();
      const gate = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const nextStaticReq = new Request('http://localhost:3000/_next/static/chunks/app.js');
      const faviconReq = new Request('http://localhost:3000/favicon.ico');
      const paymentDueReq = new Request('http://localhost:3000/payment-due');
      const healthReq = new Request('http://localhost:3000/api/health');

      const res1 = await gate(nextStaticReq);
      const res2 = await gate(faviconReq);
      const res3 = await gate(paymentDueReq);
      const res4 = await gate(healthReq);

      expect(mockFetch).not.toHaveBeenCalled();
      expect((res1 as any).allowed).toBe(true);
      expect((res1 as any).state).toBe('excluded');
      expect((res2 as any).allowed).toBe(true);
      expect((res3 as any).allowed).toBe(true);
      expect((res4 as any).allowed).toBe(true);
    });

    it('bypasses gate check for custom excluded routes', async () => {
      const mockFetch = vi.fn();
      const gate = createGate({
        secretKey,
        exclude: ['/public', '/pricing', '/api/public'],
        fetch: mockFetch as any,
      });

      const publicReq = new Request('http://localhost:3000/public/features');
      const pricingReq = new Request('http://localhost:3000/pricing');

      const res1 = await gate(publicReq);
      const res2 = await gate(pricingReq);

      expect(mockFetch).not.toHaveBeenCalled();
      expect((res1 as any).allowed).toBe(true);
      expect((res2 as any).allowed).toBe(true);
    });
  });

  describe('Stage 1: Grace Period (Days 1–3 Overdue)', () => {
    it('allows access to public and admin routes with x-rsl-grace-banner header attached', async () => {
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
              amountDuePaise: 450000,
              warningMessage: 'Payment overdue by 2 days. Grace period active: 1 day remaining.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const gate = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      // 1. Public route test
      const publicReq = new Request('http://localhost:3000/products/gadget');
      const resPublic: any = await gate(publicReq);

      expect(resPublic.allowed).toBe(true);
      expect(resPublic.status).toBe('grace_period');
      expect(resPublic.state).toBe('overdue');
      expect(resPublic.graceDaysRemaining).toBe(1);
      expect(resPublic.daysOverdue).toBe(2);
      expect(resPublic.amountDuePaise).toBe(450000);
      expect(resPublic.headers?.['x-rsl-grace-banner']).toBeDefined();

      const bannerData = JSON.parse(resPublic.headers['x-rsl-grace-banner']);
      expect(bannerData.daysOverdue).toBe(2);
      expect(bannerData.graceDaysRemaining).toBe(1);
      expect(bannerData.amountDuePaise).toBe(450000);
      expect(bannerData.warningMessage).toContain('Grace period active');

      // 2. Admin route remains 100% operational in Stage 1
      const adminReq = new Request('http://localhost:3000/admin/settings');
      const resAdmin: any = await gate(adminReq);

      expect(resAdmin.allowed).toBe(true);
      expect(resAdmin.status).toBe('grace_period');
      expect(resAdmin.graceBanner?.graceDaysRemaining).toBe(1);
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
        amountDuePaise: 950000,
        restrictedPrefixes: ['/admin', '/api/admin'],
        warningMessage: 'Account in restricted mode (5 days overdue). Admin routes restricted.',
      },
    };

    it('permits public routes (/, /products, /api/public/*) to continue seamlessly', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const gate = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const homeReq = new Request('http://localhost:3000/');
      const prodReq = new Request('http://localhost:3000/products/catalog');
      const apiPubReq = new Request('http://localhost:3000/api/public/items');

      const resHome: any = await gate(homeReq);
      const resProd: any = await gate(prodReq);
      const resApiPub: any = await gate(apiPubReq);

      expect(resHome.allowed).toBe(true);
      expect(resHome.status).toBe('restricted');
      expect(resProd.allowed).toBe(true);
      expect(resProd.status).toBe('restricted');
      expect(resApiPub.allowed).toBe(true);
      expect(resApiPub.status).toBe('restricted');
    });

    it('blocks administrative routes and redirects to payment settlement page', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const gate = createGate({
        secretKey,
        paymentUrl: 'http://localhost:3000/settle-dues',
        fetch: mockFetch as any,
      });

      const adminReq1 = new Request('http://localhost:3000/admin');
      const adminReq2 = new Request('http://localhost:3000/admin/users/export');
      const adminReq3 = new Request('http://localhost:3000/api/admin/billing');

      const res1 = await gate(adminReq1);
      const res2 = await gate(adminReq2);
      const res3 = await gate(adminReq3);

      expect(res1).toBeInstanceOf(Response);
      expect((res1 as Response).status).toBe(307);
      expect((res1 as Response).headers.get('Location')).toBe('http://localhost:3000/settle-dues');
      expect((res1 as any).allowed).toBe(false);
      expect((res1 as any).gateStatus).toBe('restricted');

      expect(res2).toBeInstanceOf(Response);
      expect((res2 as Response).status).toBe(307);

      expect(res3).toBeInstanceOf(Response);
      expect((res3 as Response).status).toBe(307);
    });

    it('honors custom adminPrefixes when configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const gate = createGate({
        secretKey,
        adminPrefixes: ['/custom-admin', '/internal-tools'],
        paymentUrl: '/payment-due',
        fetch: mockFetch as any,
      });

      // Custom prefix is blocked
      const customAdminReq = new Request('http://localhost:3000/custom-admin/settings');
      const resBlocked = await gate(customAdminReq);
      expect(resBlocked).toBeInstanceOf(Response);
      expect((resBlocked as Response).status).toBe(307);

      // Default /admin is NOT in custom prefixes, so it is treated as public route
      const defaultAdminReq = new Request('http://localhost:3000/admin');
      const resAllowed: any = await gate(defaultAdminReq);
      expect(resAllowed.allowed).toBe(true);
    });

    it('triggers onRestrictedBlocked callback when specified', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(restrictedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const onRestrictedBlocked = vi.fn().mockImplementation((req, result) => {
        return new Response(JSON.stringify({ error: 'admin_restricted_due_to_unpaid_invoices', daysOverdue: result.daysOverdue }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const gate = createGate({
        secretKey,
        onRestrictedBlocked,
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/admin/security');
      const res = await gate(req);

      expect(onRestrictedBlocked).toHaveBeenCalledTimes(1);
      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(403);
    });
  });

  describe('Stage 3: Strict Gate / Blocked (Day 8+ Overdue or Suspended)', () => {
    it('redirects to /payment-due when dues are unpaid (allowed: false / status: blocked)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'blocked',
              allowed: false,
              state: 'blocked',
              rapidshiftStatus: 'online',
              daysOverdue: 10,
              amountDuePaise: 800000,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const gate = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      // Public routes are ALSO blocked in Stage 3
      const req = new Request('http://localhost:3000/dashboard/invoices');
      const res = await gate(req);

      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(307);
      expect((res as Response).headers.get('Location')).toBe('http://localhost:3000/payment-due');
      expect((res as any).allowed).toBe(false);
      expect((res as any).gateStatus).toBe('blocked');
      expect((res as any).rapidshiftStatus).toBe('online');
    });

    it('redirects to custom paymentUrl or blockedPage when configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'blocked',
              allowed: false,
              state: 'blocked',
              rapidshiftStatus: 'online',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const gate = createGate({
        secretKey,
        paymentUrl: 'https://billing.myclient.com/pay',
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/app');
      const res = await gate(req);

      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(307);
      expect((res as Response).headers.get('Location')).toBe('https://billing.myclient.com/pay');
    });
  });

  describe('Active & Allowed requests', () => {
    it('passes through seamlessly when status is active (allowed: true)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'allowed',
              allowed: true,
              state: 'active',
              rapidshiftStatus: 'online',
              client: { id: 'cli_abc' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const gate = createGate({
        secretKey,
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/dashboard');
      const res: any = await gate(req);

      expect(res.allowed).toBe(true);
      expect(res.status).toBe('allowed');
      expect(res.state).toBe('active');
      expect(res.rapidshiftStatus).toBe('online');
      expect(res.client?.id).toBe('cli_abc');
    });
  });

  describe('Fail-open offline resilience', () => {
    it('passes through when RapidShift API is offline (fail-open default)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const gate = createGate({
        secretKey,
        failMode: 'open',
        fetch: mockFetch as any,
      });

      const req = new Request('http://localhost:3000/dashboard');
      const res: any = await gate(req);

      // Does NOT redirect; allows passage through with offline status
      expect(res.allowed).toBe(true);
      expect(res.status).toBe('allowed');
      expect(res.state).toBe('unknown');
      expect(res.rapidshiftStatus).toBe('offline');
    });
  });
});
