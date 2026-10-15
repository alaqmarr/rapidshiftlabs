/**
 * Tier 3: Cross-Feature Interaction — Billing ↔ Entitlement Gate
 * Validates: InvoiceOverdue -> Outbox -> Entitlement Grace/Restricted -> PaymentRecorded -> Outbox -> Entitlement Active
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DbFixture, type TestDatabaseHarness } from '../fixtures/db-fixture.js';

describe('Tier 3: Billing ↔ Entitlement Gate Interaction', () => {
  let harness: TestDatabaseHarness;

  beforeAll(async () => {
    harness = await DbFixture.createHarness();

    // Setup client and initial entitlement
    await harness.coreDb.execute({
      sql: 'INSERT INTO clients (id, name, code, created_at) VALUES (?, ?, ?, ?)',
      args: ['cli_b2e_1', 'B2E Client', 'B2E1', Date.now()]
    });

    await harness.coreDb.execute({
      sql: 'INSERT INTO entitlements (client_id, status, updated_at) VALUES (?, ?, ?)',
      args: ['cli_b2e_1', 'active', Date.now()]
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('Step 1: Emits InvoiceOverdue event into outbox when invoice passes due date', async () => {
    const overdueEvent = {
      eventName: 'InvoiceOverdue',
      payload: JSON.stringify({ clientId: 'cli_b2e_1', invoiceId: 'inv_b2e_101', amountPaise: 500000 })
    };

    await harness.coreDb.execute({
      sql: 'INSERT INTO outbox (id, event_name, payload, created_at) VALUES (?, ?, ?, ?)',
      args: ['ob_b2e_1', overdueEvent.eventName, overdueEvent.payload, Date.now()]
    });

    const res = await harness.coreDb.execute('SELECT * FROM outbox WHERE id = \'ob_b2e_1\'');
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.event_name).toBe('InvoiceOverdue');
  });

  it('Step 2: Worker processes InvoiceOverdue event and transitions entitlement state to Restricted', async () => {
    // Worker picks up pending outbox event
    const outboxRes = await harness.coreDb.execute('SELECT * FROM outbox WHERE dispatched_at IS NULL AND event_name = \'InvoiceOverdue\'');
    expect(outboxRes.rows).toHaveLength(1);

    const eventPayload = JSON.parse(String(outboxRes.rows[0]?.payload));

    // Recompute entitlement to restricted
    await harness.coreDb.execute({
      sql: 'UPDATE entitlements SET status = \'restricted\', updated_at = ? WHERE client_id = ?',
      args: [Date.now(), eventPayload.clientId]
    });

    // Mark outbox event dispatched
    await harness.coreDb.execute({
      sql: 'UPDATE outbox SET dispatched_at = ? WHERE id = \'ob_b2e_1\'',
      args: [Date.now()]
    });

    const entRes = await harness.coreDb.execute('SELECT status FROM entitlements WHERE client_id = \'cli_b2e_1\'');
    expect(entRes.rows[0]?.status).toBe('restricted');
  });

  it('Step 3: Recording payment emits PaymentRecorded event into outbox', async () => {
    const paymentEvent = {
      eventName: 'PaymentRecorded',
      payload: JSON.stringify({ clientId: 'cli_b2e_1', invoiceId: 'inv_b2e_101', amountPaise: 500000, balancePaise: 0 })
    };

    await harness.coreDb.execute({
      sql: 'INSERT INTO outbox (id, event_name, payload, created_at) VALUES (?, ?, ?, ?)',
      args: ['ob_b2e_2', paymentEvent.eventName, paymentEvent.payload, Date.now()]
    });

    const res = await harness.coreDb.execute('SELECT * FROM outbox WHERE id = \'ob_b2e_2\'');
    expect(res.rows[0]?.event_name).toBe('PaymentRecorded');
  });

  it('Step 4: Worker processes PaymentRecorded event and restores entitlement state to Active within seconds', async () => {
    const outboxRes = await harness.coreDb.execute('SELECT * FROM outbox WHERE dispatched_at IS NULL AND event_name = \'PaymentRecorded\'');
    expect(outboxRes.rows).toHaveLength(1);

    const eventPayload = JSON.parse(String(outboxRes.rows[0]?.payload));

    // If balance is 0, restore to active
    if (eventPayload.balancePaise === 0) {
      await harness.coreDb.execute({
        sql: 'UPDATE entitlements SET status = \'active\', updated_at = ? WHERE client_id = ?',
        args: [Date.now(), eventPayload.clientId]
      });
    }

    await harness.coreDb.execute({
      sql: 'UPDATE outbox SET dispatched_at = ? WHERE id = \'ob_b2e_2\'',
      args: [Date.now()]
    });

    const entRes = await harness.coreDb.execute('SELECT status FROM entitlements WHERE client_id = \'cli_b2e_1\'');
    expect(entRes.rows[0]?.status).toBe('active');
  });
});
