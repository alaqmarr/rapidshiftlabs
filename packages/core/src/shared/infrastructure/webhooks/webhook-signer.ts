import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookSigner {
  /**
   * Generates a hex-encoded HMAC-SHA256 signature over the payload body.
   */
  public static sign(payloadString: string, secret: string): string {
    return createHmac("sha256", secret).update(payloadString, "utf8").digest("hex");
  }

  /**
   * Validates an incoming or test signature against expected HMAC-SHA256.
   * Tolerates "sha256=" prefix if provided.
   */
  public static verify(payloadString: string, secret: string, signature: string): boolean {
    if (!signature || !secret) return false;
    const cleanSig = signature.replace(/^sha256=/, "").trim();
    const expected = this.sign(payloadString, secret);

    if (cleanSig.length !== expected.length) return false;

    try {
      return timingSafeEqual(
        Buffer.from(cleanSig, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch {
      return false;
    }
  }

  /**
   * Constructs standard HTTP headers for outbound signed webhooks.
   */
  public static createHeaders(params: {
    payloadString: string;
    secret: string;
    event: string;
    deliveryId: string;
    timestamp: number;
  }): Record<string, string> {
    const signature = this.sign(params.payloadString, params.secret);
    return {
      "Content-Type": "application/json",
      "User-Agent": "RapidShift-Outbound-Webhook/1.0",
      "X-RSL-Event": params.event,
      "X-RSL-Delivery": params.deliveryId,
      "X-RSL-Timestamp": String(params.timestamp),
      "X-RSL-Signature": `sha256=${signature}`,
      "X-Signature-SHA256": `sha256=${signature}`,
    };
  }
}
