import { describe, it, expect } from "vitest";
import { VisitorHasher } from "../../../src/modules/analytics/domain/services/visitor-hasher";

describe("Analytics — Cookieless Visitor Hasher", () => {
  it("produces deterministic hashes for the same IP and UA on the same day", () => {
    const today = new Date("2026-10-11T12:00:00Z");
    const ip = "203.0.113.42";
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

    const hash1 = VisitorHasher.hash(ip, ua, today);
    const hash2 = VisitorHasher.hash(ip, ua, today);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(hash1)).toBe(true);
  });

  it("rotates hashes across different days for privacy compliance", () => {
    const day1 = new Date("2026-10-11T12:00:00Z");
    const day2 = new Date("2026-10-12T12:00:00Z");
    const ip = "203.0.113.42";
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

    const hashDay1 = VisitorHasher.hash(ip, ua, day1);
    const hashDay2 = VisitorHasher.hash(ip, ua, day2);

    expect(hashDay1).not.toBe(hashDay2);
  });

  it("differentiates visitors with different IP addresses or User Agents", () => {
    const today = new Date("2026-10-11T12:00:00Z");
    const ua = "Mozilla/5.0 (X11; Linux x86_64)";

    const hashA = VisitorHasher.hash("198.51.100.1", ua, today);
    const hashB = VisitorHasher.hash("198.51.100.2", ua, today);

    expect(hashA).not.toBe(hashB);
  });
});
