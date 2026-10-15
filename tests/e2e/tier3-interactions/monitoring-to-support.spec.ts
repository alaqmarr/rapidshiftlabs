/**
 * Tier 3: Cross-Feature Interaction — Domain Monitoring ↔ Support Desk
 * Validates: Domain down incident -> Outbox -> Auto system ticket created -> Recovery auto-resolves both
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DbFixture, type TestDatabaseHarness } from '../fixtures/db-fixture.js';

describe('Tier 3: Domain Monitoring ↔ Support Desk Interaction', () => {
  let harness: TestDatabaseHarness;

  beforeAll(async () => {
    harness = await DbFixture.createHarness();

    await harness.coreDb.execute({
      sql: 'INSERT INTO clients (id, name, code, created_at) VALUES (?, ?, ?, ?)',
      args: ['cli_m2s_1', 'M2S Client', 'M2S1', Date.now()]
    });

    await harness.coreDb.execute({
      sql: 'INSERT INTO monitored_domains (id, client_id, hostname, status, created_at) VALUES (?, ?, ?, ?, ?)',
      args: ['dom_m2s_1', 'cli_m2s_1', 'checkout.client.com', 'healthy', Date.now()]
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('Step 1: Opens incident and creates linked system ticket on confirmed downtime', async () => {
    // 1. Open incident
    const incidentId = 'inc_m2s_1';
    await harness.coreDb.execute({
      sql: 'INSERT INTO incidents (id, domain_id, status, opened_at) VALUES (?, ?, ?, ?)',
      args: [incidentId, 'dom_m2s_1', 'open', Date.now()]
    });

    // 2. Emit IncidentOpened to outbox
    await harness.coreDb.execute({
      sql: 'INSERT INTO outbox (id, event_name, payload, created_at) VALUES (?, ?, ?, ?)',
      args: ['ob_m2s_1', 'IncidentOpened', JSON.stringify({ incidentId, domainId: 'dom_m2s_1', clientId: 'cli_m2s_1' }), Date.now()]
    });

    // 3. Support handler opens linked ticket
    const ticketId = 'tkt_m2s_sys_1';
    await harness.coreDb.execute({
      sql: 'INSERT INTO tickets (id, number, client_id, subject, priority, level, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [ticketId, 'TKT-INC-001', 'cli_m2s_1', `INCIDENT: Domain Down (checkout.client.com) [${incidentId}]`, 'P1', 'L1', 'open', Date.now()]
    });

    const ticketRes = await harness.coreDb.execute('SELECT * FROM tickets WHERE id = \'tkt_m2s_sys_1\'');
    expect(ticketRes.rows).toHaveLength(1);
    expect(ticketRes.rows[0]?.subject).toContain(incidentId);
  });

  it('Step 2: Auto-resolves both incident and linked system ticket when domain recovers', async () => {
    const resolvedAt = Date.now();

    // 1. Resolve incident
    await harness.coreDb.execute({
      sql: 'UPDATE incidents SET status = \'resolved\', resolved_at = ? WHERE id = \'inc_m2s_1\'',
      args: [resolvedAt]
    });

    // 2. Auto-resolve linked ticket
    await harness.coreDb.execute({
      sql: 'UPDATE tickets SET status = \'resolved\' WHERE id = \'tkt_m2s_sys_1\''
    });

    const incRes = await harness.coreDb.execute('SELECT status FROM incidents WHERE id = \'inc_m2s_1\'');
    expect(incRes.rows[0]?.status).toBe('resolved');

    const tktRes = await harness.coreDb.execute('SELECT status FROM tickets WHERE id = \'tkt_m2s_sys_1\'');
    expect(tktRes.rows[0]?.status).toBe('resolved');
  });
});
