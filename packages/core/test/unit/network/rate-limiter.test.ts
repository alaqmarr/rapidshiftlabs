import { describe, it, expect } from "vitest";
import { SlidingWindowRateLimiter } from "../../../src/shared/infrastructure/network/rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  it("allows requests under the limit and decrements remaining count", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 5,
    });

    const now = 100_000;
    const res1 = limiter.hit("ip:127.0.0.1", now);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(4);
    expect(res1.limit).toBe(5);

    const res2 = limiter.hit("ip:127.0.0.1", now + 1000);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  it("blocks requests once maximum limit is reached and calculates retryAfter", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 10_000,
      maxRequests: 3,
    });

    const baseTime = 50_000;
    expect(limiter.hit("user:alice", baseTime).allowed).toBe(true);
    expect(limiter.hit("user:alice", baseTime + 1000).allowed).toBe(true);
    expect(limiter.hit("user:alice", baseTime + 2000).allowed).toBe(true);

    // 4th hit should be blocked
    const blockedRes = limiter.hit("user:alice", baseTime + 3000);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.remaining).toBe(0);
    expect(blockedRes.retryAfterSeconds).toBe(7); // (50_000 + 10_000 - 53_000) / 1000 = 7s
  });

  it("allows requests after the sliding window expires", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 5_000,
      maxRequests: 2,
    });

    const t0 = 10_000;
    expect(limiter.hit("key", t0).allowed).toBe(true);
    expect(limiter.hit("key", t0 + 1000).allowed).toBe(true);
    expect(limiter.hit("key", t0 + 2000).allowed).toBe(false);

    // Advance beyond window (t0 + 5001ms)
    const tExpired = t0 + 5001;
    const resAfterExpiry = limiter.hit("key", tExpired);
    expect(resAfterExpiry.allowed).toBe(true);
  });

  it("supports manual reset of a key", () => {
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
    });

    limiter.hit("client:abc");
    limiter.hit("client:abc");
    expect(limiter.check("client:abc").allowed).toBe(false);

    limiter.reset("client:abc");
    expect(limiter.check("client:abc").allowed).toBe(true);
  });
});
