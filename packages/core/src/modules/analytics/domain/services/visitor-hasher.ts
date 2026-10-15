import { createHash } from "node:crypto";

/**
 * Generates a cookieless, privacy-preserving, daily-rotating visitor hash.
 * Uses SHA-256(dailySalt + IP + UserAgent).
 * Resets daily so visitors cannot be tracked across days.
 */
export class VisitorHasher {
  private static masterSalt: string = process.env.ANALYTICS_SALT || "rsl_analytics_privacy_salt";

  public static getDailySalt(date: Date = new Date()): string {
    const dayKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
    return createHash("sha256")
      .update(`${this.masterSalt}:${dayKey}`)
      .digest("hex");
  }

  public static hash(ip: string, userAgent: string, date: Date = new Date()): string {
    const dailySalt = this.getDailySalt(date);
    const normalizedIp = (ip || "127.0.0.1").trim();
    const normalizedUa = (userAgent || "unknown").trim();

    return createHash("sha256")
      .update(`${dailySalt}:${normalizedIp}:${normalizedUa}`)
      .digest("hex")
      .slice(0, 32); // 32 hex char identifier
  }
}
