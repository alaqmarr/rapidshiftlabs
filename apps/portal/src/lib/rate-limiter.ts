export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in ms
  retryAfterSeconds: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private lastCleanup: number = Date.now();

  constructor(config: RateLimitConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
  }

  /**
   * Check whether the key has exceeded the limit without recording a hit.
   */
  public check(key: string, now: number = Date.now()): RateLimitResult {
    this.periodicCleanup(now);

    const timestamps = this.hits.get(key) || [];
    const windowStart = now - this.windowMs;
    const valid = timestamps.filter((t) => t > windowStart);

    if (valid.length >= this.maxRequests) {
      const oldest = valid[0] ?? now;
      const resetTime = oldest + this.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetTime,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - valid.length,
      resetTime: now + this.windowMs,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Record a hit against the key and return the rate limit status.
   */
  public hit(key: string, now: number = Date.now()): RateLimitResult {
    this.periodicCleanup(now);

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    const windowStart = now - this.windowMs;
    const valid = timestamps.filter((t) => t > windowStart);

    if (valid.length >= this.maxRequests) {
      this.hits.set(key, valid);
      const oldest = valid[0] ?? now;
      const resetTime = oldest + this.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetTime,
        retryAfterSeconds,
      };
    }

    valid.push(now);
    this.hits.set(key, valid);

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - valid.length),
      resetTime: now + this.windowMs,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Reset / clear hits for a key (e.g. after successful login).
   */
  public reset(key: string): void {
    this.hits.delete(key);
  }

  private periodicCleanup(now: number): void {
    if (now - this.lastCleanup > 300_000) {
      this.lastCleanup = now;
      const windowStart = now - this.windowMs;
      for (const [key, timestamps] of this.hits.entries()) {
        const filtered = timestamps.filter((t) => t > windowStart);
        if (filtered.length === 0) {
          this.hits.delete(key);
        } else {
          this.hits.set(key, filtered);
        }
      }
    }
  }
}

/**
 * Pre-configured rate limiters for core subsystems.
 */

// Login failure rate limiter: max 5 failed attempts per 15 minutes per IP or email.
export const loginFailureLimiter = new SlidingWindowRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

// Analytics collection rate limiter: max 120 requests per minute per IP.
export const analyticsIngestLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
});

// Access gate status check rate limiter: max 300 requests per minute per IP for uncached calls.
export const gateStatusLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
});
