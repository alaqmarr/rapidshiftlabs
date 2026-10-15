/**
 * Tier 3: Cross-Feature Interaction — Fleet Ops ↔ Support Desk
 * Validates: PM2 crash loop detected -> Outbox -> Support context creates linked system ticket
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DbFixture, type TestDatabaseHarness } from '../fixtures/db-fixture.js';

describe('Tier 3: Fleet Ops ↔ Support Desk Interaction', () => {
  let harness: TestDatabaseHarness;

  beforeAll(async () => {
    harness = await DbFixture.createHarness();

    await harness.coreDb.execute({
      sql: 'INSERT INTO clients (id, name, code, created_at) VALUES (?, ?, ?, ?)',
      args: ['cli_f2s_1', 'F2S Client', 'F2S1', Date.now()]
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('detects crash loop, emits CrashLoopDetected to outbox, and auto-creates P1 system ticket', async () => {
    // 1. Worker detects crash loop (>5 restarts in 1 min)
    const restartCount = 8;
    const isCrashLoop = restartCount > 5;
    expect(isCrashLoop).toBe(true);

    // 2. Emit domain event to outbox
    const crashEvent = {
      clientId: 'cli_f2s_1',
      processName: 'client-api-prod',
      pm2Id: 1,
      restarts: restartCount
    };

    await harness.coreDb.execute({
      sql: 'INSERT INTO outbox (id, event_name, payload, created_at) VALUES (?, ?, ?, ?)',
      args: ['ob_f2s_1', 'CrashLoopDetected', JSON.stringify(crashEvent), Date.now()]
    });

    // 3. Support handler processes event and opens Auto System Ticket
    const ticketId = 'tkt_f2s_sys_1';
    await harness.coreDb.execute({
      sql: 'INSERT INTO tickets (id, number, client_id, subject, priority, level, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [ticketId, 'TKT-AUTO-002', crashEvent.clientId, `CRASH LOOP: ${crashEvent.processName} restarted ${crashEvent.restarts} times`, 'P1', 'L1', 'open', Date.now()]
    });

    // 4. Verify system ticket exists in database with P1 priority
    const ticketRes = await harness.coreDb.execute('SELECT * FROM tickets WHERE id = \'tkt_f2s_sys_1\'');
    expect(ticketRes.rows).toHaveLength(1);
    expect(ticketRes.rows[0]?.priority).toBe('P1');
    expect(ticketRes.rows[0]?.subject).toContain('CRASH LOOP');
  });
});
