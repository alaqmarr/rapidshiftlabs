import { createRemoteJWKSet, jwtVerify } from 'jose';
import { InMemoryCache } from './cache';
import type {
  AccessStatusResponse,
  GateAccessState,
  GateFailMode,
  GateStatus,
  RapidShiftClientOptions,
} from './types';

/**
 * RapidShift API Client with in-memory caching, timeout handling,
 * and strict fail-open resilience.
 */
export class RapidShiftClient {
  public readonly secretKey: string;
  public readonly baseUrl: string;
  public readonly timeoutMs: number;
  public readonly cacheTtlSeconds: number;
  public readonly failMode: GateFailMode;
  public readonly verifyToken: boolean;
  public readonly swrSeconds: number;

  private readonly fetchFn: typeof fetch;
  private readonly cache: InMemoryCache<AccessStatusResponse>;
  private jwksFetcher?: ReturnType<typeof createRemoteJWKSet>;
  private lastKnownPlatformStatus: 'online' | 'offline' = 'online';

  constructor(options: RapidShiftClientOptions) {
    if (!options?.secretKey) {
      throw new Error('RapidShiftClient requires a valid secretKey (e.g. rsk_live_...)');
    }

    this.secretKey = options.secretKey.trim();
    this.baseUrl = (
      options.baseUrl ||
      (typeof process !== 'undefined' && (process.env?.RAPIDSHIFT_API_URL || process.env?.RSL_API_URL)) ||
      'http://localhost:3000'
    ).replace(/\/$/, '');

    this.timeoutMs = options.timeoutMs ?? 2000;
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? 60;
    this.failMode = options.failMode ?? 'open';
    this.verifyToken = options.verifyToken ?? false;
    this.swrSeconds = options.swrSeconds ?? 300;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);

    this.cache = new InMemoryCache<AccessStatusResponse>({
      ttlSeconds: this.cacheTtlSeconds,
      swrSeconds: this.swrSeconds,
    });
  }

  /**
   * Retrieves access gate status for the configured secret key.
   * Leverages in-memory cache if available; fails open if API is unreachable.
   */
  async getAccessStatus(options?: {
    bypassCache?: boolean;
    signal?: AbortSignal;
  }): Promise<AccessStatusResponse> {
    const cacheKey = this.secretKey;

    // 1. Check in-memory cache (unless bypassCache requested or cache disabled)
    if (!options?.bypassCache && this.cacheTtlSeconds > 0) {
      const fresh = this.cache.get(cacheKey);
      if (fresh) {
        return fresh;
      }

      // Check SWR window
      const stale = this.cache.get(cacheKey, { allowStale: true });
      if (stale) {
        // Trigger background revalidation without blocking caller
        this.fetchStatusNetwork(options?.signal)
          .then((updated) => {
            if (updated.rapidshiftStatus === 'online') {
              this.cache.set(cacheKey, updated, this.cacheTtlSeconds, this.swrSeconds);
            }
          })
          .catch(() => {
            // Ignore background revalidation error; keep stale cache
          });
        return stale;
      }
    }

    // 2. Perform network request
    const status = await this.fetchStatusNetwork(options?.signal);

    // 3. Cache valid online response
    if (this.cacheTtlSeconds > 0 && status.rapidshiftStatus === 'online' && !status.error) {
      this.cache.set(cacheKey, status, this.cacheTtlSeconds, this.swrSeconds);
    }

    return status;
  }

  /**
   * Alias for getAccessStatus
   */
  async getStatus(options?: { bypassCache?: boolean; signal?: AbortSignal }): Promise<AccessStatusResponse> {
    return this.getAccessStatus(options);
  }

  /**
   * Returns last observed RapidShift platform status ('online' | 'offline').
   */
  getPlatformStatus(): 'online' | 'offline' {
    return this.lastKnownPlatformStatus;
  }

  /**
   * Clears the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Exposes the underlying cache instance.
   */
  getCache(): InMemoryCache<AccessStatusResponse> {
    return this.cache;
  }

  /**
   * Internal network fetch with timeout & fail-open resilience.
   */
  private async fetchStatusNetwork(externalSignal?: AbortSignal): Promise<AccessStatusResponse> {
    const controller = new AbortController();
    let timeoutFired = false;

    const timeoutId = setTimeout(() => {
      timeoutFired = true;
      controller.abort(new Error(`RapidShift API timeout after ${this.timeoutMs}ms`));
    }, this.timeoutMs);

    // Handle external abort signal
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), {
          once: true,
        });
      }
    }

    const endpoint = `${this.baseUrl}/api/v1/access/status`;

    try {
      const res = await this.fetchFn(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'X-Api-Key': this.secretKey,
          Accept: 'application/json',
          'User-Agent': '@rapidshift/sdk v1.0.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 5xx Server Errors -> Fail-open/closed
      if (res.status >= 500) {
        this.lastKnownPlatformStatus = 'offline';
        const errorMsg = `RapidShift server error (HTTP ${res.status})`;
        return this.handleFailOpen(errorMsg);
      }

      // Handle 401/403 Unauthorized/Forbidden
      if (res.status === 401 || res.status === 403) {
        this.lastKnownPlatformStatus = 'online';
        let detail = 'Invalid or unauthorized API key';
        try {
          const body = await res.json();
          if (body?.error?.message) {
            detail = body.error.message;
          }
        } catch {
          // Ignore json parse error
        }
        return {
          status: 'blocked',
          allowed: false,
          state: 'unauthorized',
          rapidshiftStatus: 'online',
          error: detail,
        };
      }

      // Handle other non-200 responses
      if (!res.ok) {
        this.lastKnownPlatformStatus = 'online';
        return {
          status: 'blocked',
          allowed: false,
          state: 'unknown',
          rapidshiftStatus: 'online',
          error: `HTTP error ${res.status}: ${res.statusText}`,
        };
      }

      // Success 200
      this.lastKnownPlatformStatus = 'online';
      const body = await res.json();
      const payload = body?.data ?? body;

      const allowed = Boolean(payload?.allowed);
      const state: GateAccessState =
        payload?.state ?? (allowed ? 'active' : 'blocked');
      const rapidshiftStatus: 'online' | 'offline' =
        payload?.rapidshiftStatus ?? 'online';
      const token: string | undefined = payload?.token;
      const client = payload?.client;
      const cachedUntil = payload?.cachedUntil;
      const daysOverdue = payload?.daysOverdue;
      const graceDaysRemaining = payload?.graceDaysRemaining;
      const amountDuePaise = payload?.amountDuePaise;
      const restrictedPrefixes = payload?.restrictedPrefixes;
      const warningMessage = payload?.warningMessage;

      const rawStatus = payload?.status as GateStatus | undefined;
      const status: GateStatus =
        rawStatus ??
        (state === 'overdue'
          ? (daysOverdue != null && daysOverdue > 7
              ? 'blocked'
              : daysOverdue != null && daysOverdue >= 4
                ? 'restricted'
                : 'grace_period')
          : allowed
            ? 'allowed'
            : 'blocked');

      // Optional JWT verification
      if (this.verifyToken && token) {
        await this.verifyAccessPassToken(token);
      }

      return {
        status,
        allowed,
        state,
        rapidshiftStatus,
        token,
        client,
        cachedUntil,
        daysOverdue,
        graceDaysRemaining,
        amountDuePaise,
        restrictedPrefixes,
        warningMessage,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      this.lastKnownPlatformStatus = 'offline';

      const errorMsg = timeoutFired
        ? `Request timed out after ${this.timeoutMs}ms`
        : err?.message || 'Network unreachable';

      return this.handleFailOpen(errorMsg);
    }
  }

  /**
   * Builds fail-open or fail-closed response for unreachable/5xx scenarios.
   */
  private handleFailOpen(errorMessage: string): AccessStatusResponse {
    if (this.failMode === 'open') {
      return {
        status: 'allowed',
        allowed: true,
        state: 'unknown',
        rapidshiftStatus: 'offline',
        error: errorMessage,
      };
    }

    return {
      status: 'blocked',
      allowed: false,
      state: 'unknown',
      rapidshiftStatus: 'offline',
      error: errorMessage,
    };
  }

  /**
   * Cryptographically verifies Ed25519 JWT access pass using public JWKS.
   */
  private async verifyAccessPassToken(token: string): Promise<void> {
    try {
      if (!this.jwksFetcher) {
        const jwksUrl = new URL(`${this.baseUrl}/.well-known/jwks.json`);
        this.jwksFetcher = createRemoteJWKSet(jwksUrl);
      }
      await jwtVerify(token, this.jwksFetcher);
    } catch (err: any) {
      throw new Error(`Access pass JWT verification failed: ${err?.message || err}`);
    }
  }
}
