/**
 * 3-Database libSQL WAL Test Fixture
 * Sets up core.db, analytics.db, and metrics.db with PRAGMAs and schema tables
 */

import { createClient, type Client } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface TestDatabaseHarness {
  coreDb: Client;
  analyticsDb: Client;
  metricsDb: Client;
  dir: string;
  close: () => Promise<void>;
}

export class DbFixture {
  static async createHarness(): Promise<TestDatabaseHarness> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsl-test-db-'));
    const corePath = path.join(tempDir, 'core.db');
    const analyticsPath = path.join(tempDir, 'analytics.db');
    const metricsPath = path.join(tempDir, 'metrics.db');

    const coreDb = createClient({ url: `file:${corePath}` });
    const analyticsDb = createClient({ url: `file:${analyticsPath}` });
    const metricsDb = createClient({ url: `file:${metricsPath}` });

    // Apply PRAGMAs to all 3 DBs
    for (const db of [coreDb, analyticsDb, metricsDb]) {
      await db.execute('PRAGMA journal_mode = WAL;');
      await db.execute('PRAGMA synchronous = NORMAL;');
      await db.execute('PRAGMA busy_timeout = 5000;');
      await db.execute('PRAGMA foreign_keys = ON;');
    }

    // Initialize core schema
    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        legal_name TEXT,
        gstin TEXT,
        state_code TEXT,
        currency TEXT DEFAULT 'INR',
        billing_mode TEXT DEFAULT 'gst',
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id),
        amount_paise INTEGER NOT NULL,
        billing_cycle TEXT NOT NULL,
        anchor_day INTEGER NOT NULL,
        valid_from INTEGER NOT NULL,
        valid_to INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id),
        contract_id TEXT,
        number TEXT UNIQUE NOT NULL,
        subtotal_paise INTEGER NOT NULL,
        tax_paise INTEGER NOT NULL,
        total_paise INTEGER NOT NULL,
        paid_paise INTEGER DEFAULT 0,
        balance_paise INTEGER NOT NULL,
        status TEXT NOT NULL,
        due_date INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id),
        client_id TEXT NOT NULL REFERENCES clients(id),
        amount_paise INTEGER NOT NULL,
        method TEXT NOT NULL,
        reference TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS entitlements (
        client_id TEXT PRIMARY KEY REFERENCES clients(id),
        status TEXT NOT NULL,
        override_status TEXT,
        override_until INTEGER,
        updated_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        number TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL REFERENCES clients(id),
        subject TEXT NOT NULL,
        priority TEXT NOT NULL,
        level TEXT NOT NULL,
        status TEXT NOT NULL,
        first_response_due_at INTEGER,
        resolution_due_at INTEGER,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id),
        author_id TEXT NOT NULL,
        body TEXT NOT NULL,
        is_internal INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER DEFAULT 22,
        username TEXT DEFAULT 'ubuntu',
        private_key_enc TEXT NOT NULL,
        host_fingerprint TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS pm2_processes (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES servers(id),
        client_id TEXT REFERENCES clients(id),
        pm2_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        allow_client_restart INTEGER DEFAULT 1,
        last_restarted_at INTEGER,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS monitored_domains (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id),
        hostname TEXT NOT NULL,
        status TEXT DEFAULT 'unknown',
        consecutive_failures INTEGER DEFAULT 0,
        last_checked_at INTEGER,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL REFERENCES monitored_domains(id),
        status TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        payload TEXT NOT NULL,
        dispatched_at INTEGER,
        created_at INTEGER NOT NULL
      );
    `);

    await coreDb.execute(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // Initialize analytics schema
    await analyticsDb.execute(`
      CREATE TABLE IF NOT EXISTS raw_events (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        payload TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    await analyticsDb.execute(`
      CREATE TABLE IF NOT EXISTS hourly_rollups (
        client_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        hour_epoch INTEGER NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (client_id, event_name, hour_epoch)
      );
    `);

    // Initialize metrics schema
    await metricsDb.execute(`
      CREATE TABLE IF NOT EXISTS server_metrics (
        server_id TEXT NOT NULL,
        cpu_pct REAL,
        mem_pct REAL,
        recorded_at INTEGER NOT NULL
      );
    `);

    const close = async () => {
      coreDb.close();
      analyticsDb.close();
      metricsDb.close();
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    };

    return { coreDb, analyticsDb, metricsDb, dir: tempDir, close };
  }
}
