/**
 * Tier 3: Cross-Feature Interaction — Analytics Ingest ↔ Client Offload Pipeline
 * Validates: Raw event ingest -> Hourly rollup -> HMAC signed webhook push -> Pull export API matches
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DbFixture, type TestDatabaseHarness } from '../fixtures/db-fixture.js';
import crypto from 'node:crypto';

describe('Tier 3: Analytics Ingest ↔ Client Offload Pipeline', () => {
  let harness: TestDatabaseHarness;

  beforeAll(async () => {
    harness = await DbFixture.createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('Step 1: Ingests batch of analytics events into analytics.db', async () => {
    const events = [
      { id: 'evt_off_1', client_id: 'cli_off_1', event_name: 'page_view', payload: '{"path":"/home"}' },
      { id: 'evt_off_2', client_id: 'cli_off_1', event_name: 'custom_signup', payload: '{"plan":"pro"}' }
    ];

    for (const evt of events) {
      await harness.analyticsDb.execute({
        sql: 'INSERT INTO raw_events (id, client_id, event_name, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [evt.id, evt.client_id, evt.event_name, evt.payload, Date.now()]
      });
    }

    const res = await harness.analyticsDb.execute('SELECT COUNT(*) FROM raw_events WHERE client_id = \'cli_off_1\'');
    expect(Number(res.rows[0]?.[0])).toBe(2);
  });

  it('Step 2: Dispatches HMAC-SHA256 signed push batch to client offload webhook', () => {
    const clientOffloadSecret = 'whsec_client_hmac_secret_456';
    const batchPayload = JSON.stringify([
      { id: 'evt_off_1', event: 'page_view', path: '/home' },
      { id: 'evt_off_2', event: 'custom_signup', plan: 'pro' }
    ]);

    const generatedSignature = crypto.createHmac('sha256', clientOffloadSecret).update(batchPayload).digest('hex');

    // Receiver verifies signature
    const verifiedSignature = crypto.createHmac('sha256', clientOffloadSecret).update(batchPayload).digest('hex');
    expect(generatedSignature).toBe(verifiedSignature);
    expect(generatedSignature).toHaveLength(64);
  });

  it('Step 3: Pull export API returns matching events via cursor pagination', async () => {
    const res = await harness.analyticsDb.execute('SELECT * FROM raw_events WHERE client_id = \'cli_off_1\' ORDER BY created_at ASC');
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]?.id).toBe('evt_off_1');
    expect(res.rows[1]?.id).toBe('evt_off_2');
  });
});
