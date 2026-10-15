# Webhooks & Event Delivery Guide

RapidShift provides an asynchronous webhook delivery pipeline powered by the Transactional Outbox pattern. When key lifecycle events occur (such as invoices being issued, payments received, domains going down, or support tickets escalated), RapidShift dispatches signed HTTP POST requests to your configured webhook endpoints.

---

## 1. Supported Event Catalog

| Event Name | Aggregate | Trigger Condition |
|---|---|---|
| `invoice.issued` | Billing | An invoice is finalized and issued with FY numbering series |
| `invoice.paid` | Billing | An invoice balance reaches zero following recorded payment |
| `invoice.overdue` | Billing | Invoice due date passes without payment and grace expires |
| `payment.recorded` | Billing | A manual payment (bank transfer, UPI, cheque) is logged |
| `domain.down` | Monitoring | Target domain fails health checks exceeding threshold (N=3) |
| `domain.recovered` | Monitoring | A previously down domain responds with 200 OK |
| `ssl.expiring` | Monitoring | SSL certificate expires within warning window (default 15 days) |
| `ticket.created` | Support Desk | A client or system incident creates a new ticket |
| `ticket.replied` | Support Desk | Staff or client posts a new reply to an open thread |
| `ticket.escalated` | Support Desk | Ticket breaches SLA or is manually escalated to next tier |
| `process.restarted`| Fleet Ops | A client or administrator triggers a PM2 restart |

---

## 2. Webhook Security: HMAC-SHA256 Verification

To prevent spoofing or replay attacks, RapidShift signs every webhook payload with your secret webhook key using HMAC-SHA256. The hexadecimal digest is transmitted in the `X-RapidShift-Signature` header, along with a timestamp in `X-RapidShift-Timestamp`.

### Node.js / TypeScript Verification Example

```typescript
import crypto from "node:crypto";

export function verifyWebhookSignature(
  rawPayload: string,
  signatureHeader: string,
  timestampHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300
): boolean {
  // 1. Prevent replay attacks: Verify timestamp is within 5 minutes
  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // 2. Compute expected HMAC digest over `${timestamp}.${rawPayload}`
  const signatureData = `${timestamp}.${rawPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signatureData)
    .digest("hex");

  // 3. Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}
```

---

## 3. Webhook Payload Structure

All webhook deliveries follow the standardized event envelope:

```json
{
  "id": "evt_01HQXYZ1234567890",
  "event": "invoice.issued",
  "createdAt": "2026-10-10T12:00:00.000Z",
  "data": {
    "invoiceId": "inv_01HQXYZ123",
    "invoiceNumber": "RSL/2026-27/0042",
    "clientId": "cli_01HQXYZ789",
    "totalPaise": 5900000,
    "balancePaise": 5900000,
    "dueDate": "2026-10-25"
  }
}
```

---

## 4. Retry Policy & Delivery Guarantees

If your endpoint returns an HTTP status code outside of `200..299` or times out (after 5000 ms), the RapidShift background worker retries delivery using exponential backoff with jitter:

1. **Attempt 1**: Immediate
2. **Attempt 2**: After 10 seconds
3. **Attempt 3**: After 30 seconds
4. **Attempt 4**: After 2 minutes
5. **Attempt 5**: After 10 minutes
6. **Attempt 6**: After 1 hour

If all 6 attempts fail, the event is marked as `failed` in the outbox table and an incident notification is logged.
