import { RapidShiftClient } from './client';
import type { GateOptions, GateResult, GateStatus, GraceBannerDetails } from './types';

const DEFAULT_EXCLUDE = [
  '/_next',
  '/favicon.ico',
  '/payment-due',
  '/api/health',
  '/robots.txt',
  '/sitemap.xml',
];

/**
 * Checks whether a given pathname matches any excluded paths or patterns.
 */
function isPathExcluded(pathname: string, excludes: string[]): boolean {
  for (const pattern of excludes) {
    if (!pattern) continue;

    // Exact match
    if (pathname === pattern) {
      return true;
    }

    // Prefix match (e.g. /_next/static matches /_next)
    if (pattern.endsWith('/')) {
      if (pathname.startsWith(pattern)) return true;
    } else {
      if (pathname.startsWith(`${pattern}/`)) return true;
    }
  }

  return false;
}

/**
 * Creates a Next.js middleware / proxy gate handler.
 * Validates client dues and access status against RapidShift using 3-stage tiered gating:
 * - Stage 1 (Days 1–3 Overdue: Grace Period): passes through and appends x-rsl-grace-banner header.
 * - Stage 2 (Days 4–7 Overdue: Restricted Mode): customer routes remain open; admin routes blocked.
 * - Stage 3 (Day 8+ Overdue or Suspended): strict gate; all routes redirected to payment page.
 * - 100% fail-open guarantee if RapidShift control plane cannot be reached.
 */
export function createGate(options: GateOptions) {
  if (!options?.secretKey) {
    throw new Error('createGate requires a secretKey option (e.g. rsk_live_...)');
  }

  const paymentDestination = options.paymentUrl || options.blockedPage || '/payment-due';
  const defaultAdminPrefixes = ['/admin', '/api/admin'];
  const rawExclude = options.exclude ?? [];
  const mergedExcludes = Array.from(
    new Set([...DEFAULT_EXCLUDE, paymentDestination, ...rawExclude])
  );

  const client =
    options.client instanceof RapidShiftClient
      ? options.client
      : new RapidShiftClient({
          secretKey: options.secretKey,
          baseUrl: options.baseUrl,
          timeoutMs: options.timeoutMs,
          cacheTtlSeconds: options.cacheTtlSeconds,
          failMode: options.failMode,
          verifyToken: options.verifyToken,
          fetch: options.fetch,
        });

  /**
   * Middleware / Proxy Request Handler
   */
  return async function gateHandler(
    req: Request | { url: string; headers?: any }
  ): Promise<GateResult | Response> {
    const rawUrl = typeof req === 'string' ? req : req.url;
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const pathname = parsedUrl.pathname;

    // 1. Exclude static assets, health checks, and payment page
    if (isPathExcluded(pathname, mergedExcludes)) {
      return {
        status: 'allowed',
        allowed: true,
        state: 'excluded',
        rapidshiftStatus: client.getPlatformStatus(),
      };
    }

    // 2. Fetch access status (leveraging client in-memory cache & fail-open)
    const status = await client.getAccessStatus();

    // Resolve 3-stage status
    const resolvedStatus: GateStatus =
      (status.status as GateStatus) ||
      (status.allowed
        ? status.state === 'overdue'
          ? 'grace_period'
          : 'allowed'
        : 'blocked');

    const paymentUrl =
      paymentDestination.startsWith('http://') || paymentDestination.startsWith('https://')
        ? paymentDestination
        : new URL(paymentDestination, rawUrl).toString();

    // 3. Stage 3: Blocked (Day 8+ Overdue, Suspended, or Strict Cutoff)
    if (resolvedStatus === 'blocked' || !status.allowed) {
      const gateResult: GateResult = {
        status: 'blocked',
        allowed: false,
        state: status.state,
        rapidshiftStatus: status.rapidshiftStatus,
        redirectUrl: paymentUrl,
        client: status.client,
        token: status.token,
        error: status.error,
        daysOverdue: status.daysOverdue,
        amountDuePaise: status.amountDuePaise,
        warningMessage: status.warningMessage,
      };

      if (options.onBlocked) {
        const customResponse = await options.onBlocked(req as Request, gateResult);
        const { status: _, ...rest } = gateResult;
        return Object.assign(customResponse, rest, { gateStatus: gateResult.status });
      }

      // Standard HTTP 307 Temporary Redirect Response
      const redirectResponse = Response.redirect(paymentUrl, 307);
      gateResult.response = redirectResponse;

      // Attach gateResult properties without colliding with Response.status (HTTP status code)
      const { status: _, ...rest } = gateResult;
      return Object.assign(redirectResponse, rest, { gateStatus: gateResult.status });
    }

    // 4. Stage 2: Restricted Mode (Days 4–7 Overdue)
    if (resolvedStatus === 'restricted') {
      const activeAdminPrefixes = options.adminPrefixes ?? status.restrictedPrefixes ?? defaultAdminPrefixes;
      const isAdminRoute = activeAdminPrefixes.some((prefix) => {
        if (!prefix) return false;
        if (pathname === prefix) return true;
        if (prefix.endsWith('/')) {
          return pathname.startsWith(prefix);
        }
        return pathname.startsWith(`${prefix}/`) || pathname === prefix || pathname.startsWith(prefix);
      });

      if (isAdminRoute) {
        // Administrative routes are blocked / redirected to payment settlement
        const gateResult: GateResult = {
          status: 'restricted',
          allowed: false,
          state: status.state,
          rapidshiftStatus: status.rapidshiftStatus,
          redirectUrl: paymentUrl,
          client: status.client,
          token: status.token,
          error: status.error,
          daysOverdue: status.daysOverdue,
          amountDuePaise: status.amountDuePaise,
          restrictedPrefixes: activeAdminPrefixes,
          warningMessage: status.warningMessage,
        };

        if (options.onRestrictedBlocked) {
          const customResponse = await options.onRestrictedBlocked(req as Request, gateResult);
          const { status: _, ...rest } = gateResult;
          return Object.assign(customResponse, rest, { gateStatus: gateResult.status });
        }

        if (options.onBlocked) {
          const customResponse = await options.onBlocked(req as Request, gateResult);
          const { status: _, ...rest } = gateResult;
          return Object.assign(customResponse, rest, { gateStatus: gateResult.status });
        }

        const redirectResponse = Response.redirect(paymentUrl, 307);
        gateResult.response = redirectResponse;
        const { status: _, ...rest } = gateResult;
        return Object.assign(redirectResponse, rest, { gateStatus: gateResult.status });
      }

      // Public customer-facing routes remain open
      const allowedResult: GateResult = {
        status: 'restricted',
        allowed: true,
        state: status.state,
        rapidshiftStatus: status.rapidshiftStatus,
        client: status.client,
        token: status.token,
        error: status.error,
        daysOverdue: status.daysOverdue,
        amountDuePaise: status.amountDuePaise,
        restrictedPrefixes: activeAdminPrefixes,
        warningMessage: status.warningMessage,
      };

      if (options.onAllowed) {
        const customResponse = await options.onAllowed(req as Request, allowedResult);
        if (customResponse) {
          return Object.assign(customResponse, allowedResult);
        }
      }

      return allowedResult;
    }

    // 5. Stage 1: Grace Period (Days 1–3 Overdue)
    if (resolvedStatus === 'grace_period') {
      const bannerDetails: GraceBannerDetails = {
        daysOverdue: status.daysOverdue,
        graceDaysRemaining: status.graceDaysRemaining,
        amountDuePaise: status.amountDuePaise,
        warningMessage: status.warningMessage,
      };
      const bannerJson = JSON.stringify(bannerDetails);

      // Append header / property to request if possible
      try {
        if (typeof (req as any).headers?.set === 'function') {
          (req as any).headers.set('x-rsl-grace-banner', bannerJson);
        } else if ((req as any).headers && typeof (req as any).headers === 'object') {
          (req as any).headers['x-rsl-grace-banner'] = bannerJson;
        }
      } catch {}
      try {
        (req as any)['x-rsl-grace-banner'] = bannerJson;
        (req as any).graceBanner = bannerDetails;
      } catch {}

      const allowedResult: GateResult = {
        status: 'grace_period',
        allowed: true,
        state: status.state,
        rapidshiftStatus: status.rapidshiftStatus,
        client: status.client,
        token: status.token,
        error: status.error,
        daysOverdue: status.daysOverdue,
        graceDaysRemaining: status.graceDaysRemaining,
        amountDuePaise: status.amountDuePaise,
        warningMessage: status.warningMessage,
        graceBanner: bannerDetails,
        headers: {
          'x-rsl-grace-banner': bannerJson,
        },
      };

      if (options.onAllowed) {
        const customResponse = await options.onAllowed(req as Request, allowedResult);
        if (customResponse) {
          if (customResponse instanceof Response && customResponse.headers) {
            customResponse.headers.set('x-rsl-grace-banner', bannerJson);
          }
          return Object.assign(customResponse, allowedResult);
        }
      }

      return allowedResult;
    }

    // 6. Stage 0: Active / Allowed Access (or fail-open offline)
    const allowedResult: GateResult = {
      status: 'allowed',
      allowed: true,
      state: status.state,
      rapidshiftStatus: status.rapidshiftStatus,
      client: status.client,
      token: status.token,
      error: status.error,
    };

    if (options.onAllowed) {
      const customResponse = await options.onAllowed(req as Request, allowedResult);
      if (customResponse) {
        return Object.assign(customResponse, allowedResult);
      }
    }

    // Pass through seamlessly
    return allowedResult;
  };
}
