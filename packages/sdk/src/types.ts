/**
 * RapidShift SDK v1 Types & Interfaces
 */

export type GateAccessState =
  | 'active'
  | 'overdue'
  | 'blocked'
  | 'suspended'
  | 'unknown'
  | 'unauthorized'
  | 'excluded';

export type GateStatus = 'allowed' | 'grace_period' | 'restricted' | 'blocked';

export type RapidShiftPlatformStatus = 'online' | 'offline';

export type GateFailMode = 'open' | 'closed';

export interface ClientIdentity {
  id: string;
  name?: string;
}

export interface GraceBannerDetails {
  daysOverdue?: number;
  graceDaysRemaining?: number;
  amountDuePaise?: number;
  warningMessage?: string;
}

export interface AccessStatusResponse {
  status?: GateStatus | string;
  allowed: boolean;
  state: GateAccessState | string;
  rapidshiftStatus: RapidShiftPlatformStatus;
  token?: string;
  client?: ClientIdentity;
  cachedUntil?: number;
  error?: string;
  daysOverdue?: number;
  graceDaysRemaining?: number;
  amountDuePaise?: number;
  restrictedPrefixes?: string[];
  warningMessage?: string;
}

export interface GateResult {
  status?: GateStatus | string;
  allowed: boolean;
  state: GateAccessState | string;
  rapidshiftStatus: RapidShiftPlatformStatus;
  redirectUrl?: string;
  response?: Response;
  token?: string;
  client?: ClientIdentity;
  error?: string;
  daysOverdue?: number;
  graceDaysRemaining?: number;
  amountDuePaise?: number;
  restrictedPrefixes?: string[];
  warningMessage?: string;
  graceBanner?: GraceBannerDetails;
  headers?: Record<string, string>;
}

export interface RapidShiftClientOptions {
  /**
   * Secret API key for authentication (starts with rsk_live_ or similar).
   */
  secretKey: string;

  /**
   * Base URL of the RapidShift API (default: RAPIDSHIFT_API_URL or http://localhost:3000).
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds (default: 2000ms).
   */
  timeoutMs?: number;

  /**
   * In-memory cache TTL in seconds (default: 60s). Set to 0 to disable cache.
   */
  cacheTtlSeconds?: number;

  /**
   * Behavior when RapidShift is unreachable or returns 5xx (default: 'open').
   * 'open': allows access (allowed: true, rapidshiftStatus: 'offline')
   * 'closed': denies access (allowed: false, rapidshiftStatus: 'offline')
   */
  failMode?: GateFailMode;

  /**
   * Whether to cryptographically verify Ed25519 access pass token via JWKS.
   */
  verifyToken?: boolean;

  /**
   * Stale-While-Revalidate window in seconds (default: 300s).
   */
  swrSeconds?: number;

  /**
   * Custom fetch function (default: globalThis.fetch).
   */
  fetch?: typeof fetch;
}

export interface GateOptions {
  /**
   * Secret API key for authentication.
   */
  secretKey: string;

  /**
   * Base URL of the RapidShift API.
   */
  baseUrl?: string;

  /**
   * Destination path or URL when client dues are unpaid / access is blocked (default: '/payment-due').
   */
  blockedPage?: string;

  /**
   * Destination payment URL or page (alias for blockedPage, default: '/payment-due').
   */
  paymentUrl?: string;

  /**
   * Admin route prefixes to block when client is in restricted mode (default: ['/admin', '/api/admin']).
   */
  adminPrefixes?: string[];

  /**
   * Request timeout in milliseconds (default: 2000ms).
   */
  timeoutMs?: number;

  /**
   * In-memory cache TTL in seconds (default: 60s).
   */
  cacheTtlSeconds?: number;

  /**
   * Behavior when RapidShift is unreachable (default: 'open').
   */
  failMode?: GateFailMode;

  /**
   * Path prefixes to exclude from gate checking (e.g. ['/_next', '/favicon.ico', '/payment-due']).
   */
  exclude?: string[];

  /**
   * Whether to cryptographically verify Ed25519 access pass token.
   */
  verifyToken?: boolean;

  /**
   * Custom fetch function (default: globalThis.fetch).
   */
  fetch?: typeof fetch;

  /**
   * Optional custom client instance.
   */
  client?: any;

  /**
   * Optional custom handler invoked when access is blocked.
   */
  onBlocked?: (req: Request, result: GateResult) => Response | Promise<Response>;

  /**
   * Optional custom handler invoked when restricted admin route is blocked.
   */
  onRestrictedBlocked?: (req: Request, result: GateResult) => Response | Promise<Response>;

  /**
   * Optional custom handler invoked when access is allowed.
   */
  onAllowed?: (req: Request, result: GateResult) => Response | void | Promise<Response | void>;
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  staleUntil?: number;
}

export interface CacheOptions {
  ttlSeconds?: number;
  swrSeconds?: number;
  maxSize?: number;
}

export interface AccessPassClaims {
  sub?: string;
  clientId?: string;
  allowed: boolean;
  state: string;
  keyId?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  [key: string]: unknown;
}
