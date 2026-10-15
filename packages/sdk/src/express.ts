import { createGate } from './gate';
import type { GateOptions, GateResult } from './types';

/**
 * Express middleware adapter for RapidShift gate.
 * Implements 3-stage tiered access gating:
 * - Stage 1 (grace_period): calls next() and attaches x-rsl-grace-banner header & req properties.
 * - Stage 2 (restricted): blocks and redirects admin routes to paymentUrl; allows public routes.
 * - Stage 3 (blocked): redirects all routes to paymentUrl.
 * - Fail-open: guarantees 100% uptime by continuing if RapidShift is offline.
 */
export function createExpressGate(options: GateOptions) {
  const gate = createGate(options);

  return async function rapidShiftExpressMiddleware(req: any, res: any, next: any) {
    try {
      const fullUrl = `${req.protocol || 'http'}://${req.get?.('host') || 'localhost'}${req.originalUrl || req.url || '/'}`;
      const request = new Request(fullUrl, {
        method: req.method || 'GET',
        headers: req.headers,
      });

      const result = await gate(request);

      // Handle redirect responses (Blocked or Restricted Admin routes)
      if (result instanceof Response) {
        if (result.status >= 300 && result.status < 400) {
          const location =
            result.headers.get('Location') || options.paymentUrl || options.blockedPage || '/payment-due';
          return res.redirect(result.status, location);
        }
      }

      const gateResult = result as GateResult;

      if (!gateResult.allowed && gateResult.redirectUrl) {
        return res.redirect(307, gateResult.redirectUrl);
      }

      // Stage 1: Grace Period banner attachment
      if (gateResult.status === 'grace_period') {
        const bannerVal =
          (gateResult.headers && typeof gateResult.headers === 'object' && 'x-rsl-grace-banner' in gateResult.headers
            ? (gateResult.headers as Record<string, string>)['x-rsl-grace-banner']
            : null) ||
          JSON.stringify(
            gateResult.graceBanner || {
              daysOverdue: gateResult.daysOverdue,
              graceDaysRemaining: gateResult.graceDaysRemaining,
              amountDuePaise: gateResult.amountDuePaise,
              warningMessage: gateResult.warningMessage,
            }
          );

        if (typeof res.setHeader === 'function') {
          res.setHeader('x-rsl-grace-banner', bannerVal);
        }
        if (req.headers && typeof req.headers === 'object') {
          req.headers['x-rsl-grace-banner'] = bannerVal;
        }
        req['x-rsl-grace-banner'] = bannerVal;
        req.graceBanner = gateResult.graceBanner;
      }

      // Attach gate result to Express req object
      req.rapidshift = gateResult;
      return next();
    } catch (err) {
      // In fail-open mode, continue
      if (options.failMode !== 'closed') {
        req.rapidshift = { allowed: true, status: 'allowed', state: 'unknown', rapidshiftStatus: 'offline' };
        return next();
      }
      return next(err);
    }
  };
}
