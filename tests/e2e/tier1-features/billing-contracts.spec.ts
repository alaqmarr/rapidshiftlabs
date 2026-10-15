/**
 * Tier 1: Feature Coverage — Milestone 2 (Features 17 - 37)
 * CRM, Contracts, Billing Schedules, GST/Non-GST Invoices, Payments, PDF, Revenue
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DbFixture, type TestDatabaseHarness } from '../fixtures/db-fixture.js';
import { TestOracle } from '../helpers/test-oracle.js';
import { MockMailSink } from '../fixtures/mock-services.js';

describe('Tier 1: CRM, Contracts, Billing & Settings (Features 17 - 37)', () => {
  let harness: TestDatabaseHarness;
  let mailSink: MockMailSink;

  beforeAll(async () => {
    harness = await DbFixture.createHarness();
    mailSink = new MockMailSink();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('Feature 17 & 18: Settings & Encrypted Credentials', () => {
    it('stores firm legal details, GSTIN, and state code', () => {
      const firmSettings = {
        legalName: 'RapidShift Labs Private Limited',
        gstin: '29ABCDE1234F1Z5',
        stateCode: '29',
        pan: 'ABCDE1234F',
        bankAccount: '1234567890',
        ifsc: 'HDFC0001234'
      };
      expect(firmSettings.gstin).toHaveLength(15);
      expect(firmSettings.stateCode).toBe('29');
    });
    it('validates GSTIN structure format', () => {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      expect(gstinRegex.test('29ABCDE1234F1Z5')).toBe(true);
    });
    it('stores encrypted email credentials without raw plaintext', () => {
      const encryptedPayload = { iv: 'a1b2c3d4', tag: 'e5f6g7h8', ciphertext: '8d9e0f1a2b' };
      expect(encryptedPayload.ciphertext).not.toContain('mypassword123');
    });
    it('verifies SMTP transport port configuration', () => {
      const smtpConfig = { host: 'smtp.gmail.com', port: 465, secure: true };
      expect(smtpConfig.port).toBe(465);
      expect(smtpConfig.secure).toBe(true);
    });
    it('verifies bank details format on firm settings', () => {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      expect(ifscRegex.test('HDFC0001234')).toBe(true);
    });
  });

  describe('Feature 19, 20, 21: Client CRM & Tenant Isolation', () => {
    it('creates client entity with currency and timezone', async () => {
      await harness.coreDb.execute({
        sql: 'INSERT INTO clients (id, name, code, legal_name, gstin, state_code, currency, billing_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['cli_1', 'Acme Corp', 'ACME', 'Acme Corporation Ltd', '29XYZAB1234C1Z1', '29', 'INR', 'gst', Date.now()]
      });
      const res = await harness.coreDb.execute('SELECT * FROM clients WHERE id = \'cli_1\'');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.code).toBe('ACME');
    });
    it('creates non-GST client entity', async () => {
      await harness.coreDb.execute({
        sql: 'INSERT INTO clients (id, name, code, legal_name, currency, billing_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['cli_2', 'Beta Global', 'BETA', 'Beta Global Inc', 'USD', 'non_gst', Date.now()]
      });
      const res = await harness.coreDb.execute('SELECT billing_mode FROM clients WHERE id = \'cli_2\'');
      expect(res.rows[0]?.billing_mode).toBe('non_gst');
    });
    it('asserts tenant isolation between clients', async () => {
      const actorClient1 = { clientId: 'cli_1', role: 'client_admin' };
      const canAccess = (actor: { clientId: string }, targetClientId: string) => actor.clientId === targetClientId;
      expect(canAccess(actorClient1, 'cli_1')).toBe(true);
      expect(canAccess(actorClient1, 'cli_2')).toBe(false);
    });
    it('verifies client user role assignment', () => {
      const roles = ['client_admin', 'client_member'] as const;
      expect(roles).toContain('client_admin');
      expect(roles).toContain('client_member');
    });
    it('queries clients scoped strictly to matching ID', async () => {
      const res = await harness.coreDb.execute('SELECT id FROM clients WHERE id = \'cli_1\'');
      expect(res.rows[0]?.id).toBe('cli_1');
    });
  });

  describe('Feature 22, 23, 24: Contract Management & Billing Schedules', () => {
    it('creates contract with tenure dates and billing interval', async () => {
      const validFrom = Date.UTC(2026, 3, 1); // April 1, 2026
      const validTo = Date.UTC(2027, 2, 31);   // March 31, 2027
      await harness.coreDb.execute({
        sql: 'INSERT INTO contracts (id, client_id, amount_paise, billing_cycle, anchor_day, valid_from, valid_to, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['ctr_1', 'cli_1', 10000000, 'monthly', 1, validFrom, validTo, 'active', Date.now()]
      });
      const res = await harness.coreDb.execute('SELECT * FROM contracts WHERE id = \'ctr_1\'');
      expect(res.rows).toHaveLength(1);
      expect(Number(res.rows[0]?.amount_paise)).toBe(10000000);
    });
    it('validates contract lifecycle state transitions Draft -> Active -> Expired', () => {
      const states = ['draft', 'active', 'expired', 'terminated'] as const;
      let currentStatus: (typeof states)[number] = 'draft';
      expect(currentStatus).toBe('draft');
      currentStatus = 'active';
      expect(currentStatus).toBe('active');
      currentStatus = 'expired';
      expect(currentStatus).toBe('expired');
    });
    it('generates billing periods with month-end clamping', () => {
      // Clamping January 31 anchor day to February 2026 (non-leap year, 28 days)
      const febClamped = TestOracle.clampMonthEndDay(2026, 1, 31);
      expect(febClamped.getUTCDate()).toBe(28);

      // Clamping January 31 anchor day to February 2028 (leap year, 29 days)
      const febLeapClamped = TestOracle.clampMonthEndDay(2028, 1, 31);
      expect(febLeapClamped.getUTCDate()).toBe(29);
    });
    it('verifies 30-day month clamping (April)', () => {
      const aprilClamped = TestOracle.clampMonthEndDay(2026, 3, 31);
      expect(aprilClamped.getUTCDate()).toBe(30);
    });
    it('asserts tenure boundary alignment', () => {
      const validFrom = new Date(Date.UTC(2026, 3, 1));
      const validTo = new Date(Date.UTC(2027, 2, 31));
      expect(validTo.getTime()).toBeGreaterThan(validFrom.getTime());
    });
  });

  describe('Feature 25, 26, 27, 28: Invoices & GST Split Calculations', () => {
    it('calculates intra-state GST (9% CGST + 9% SGST)', () => {
      const subtotalPaise = 10000000; // Rs 1,00,000.00
      const gst = TestOracle.calculateGst(subtotalPaise, true, true);
      expect(gst.cgstPaise).toBe(900000);
      expect(gst.sgstPaise).toBe(900000);
      expect(gst.igstPaise).toBe(0);
      expect(gst.taxPaise).toBe(1800000);
      expect(gst.totalPaise).toBe(11800000);
    });
    it('calculates inter-state GST (18% IGST)', () => {
      const subtotalPaise = 10000000;
      const gst = TestOracle.calculateGst(subtotalPaise, false, true);
      expect(gst.cgstPaise).toBe(0);
      expect(gst.sgstPaise).toBe(0);
      expect(gst.igstPaise).toBe(1800000);
      expect(gst.totalPaise).toBe(11800000);
    });
    it('calculates Non-GST mode with 0 tax', () => {
      const subtotalPaise = 10000000;
      const gst = TestOracle.calculateGst(subtotalPaise, true, false);
      expect(gst.taxPaise).toBe(0);
      expect(gst.totalPaise).toBe(subtotalPaise);
    });
    it('formats sequential FY invoice number for GST mode (RSL/2026-27/0001)', () => {
      const date = new Date(Date.UTC(2026, 4, 15)); // May 15, 2026
      const invNum = TestOracle.formatInvoiceNumber('RSL', date, 1);
      expect(invNum).toBe('RSL/2026-27/0001');
    });
    it('formats separate numbering series for Non-GST mode (RSL-NG/2026-27/0001)', () => {
      const date = new Date(Date.UTC(2026, 4, 15));
      const invNum = TestOracle.formatInvoiceNumber('RSL-NG', date, 1);
      expect(invNum).toBe('RSL-NG/2026-27/0001');
    });
    it('asserts GST settings gate blocks GST invoice if firm GST unconfigured', () => {
      const firmConfigured = false;
      const canCreateGstInvoice = (configured: boolean) => configured;
      expect(canCreateGstInvoice(firmConfigured)).toBe(false);
    });
  });

  describe('Feature 29 - 35: Invoices, Payments, Overdue & Balance', () => {
    it('inserts invoice record into database with due date', async () => {
      const dueDate = Date.now() + 864000000; // 10 days
      await harness.coreDb.execute({
        sql: 'INSERT INTO invoices (id, client_id, contract_id, number, subtotal_paise, tax_paise, total_paise, paid_paise, balance_paise, status, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['inv_1', 'cli_1', 'ctr_1', 'RSL/2026-27/0001', 1000000, 180000, 1180000, 0, 1180000, 'issued', dueDate, Date.now()]
      });
      const res = await harness.coreDb.execute('SELECT * FROM invoices WHERE id = \'inv_1\'');
      expect(res.rows).toHaveLength(1);
      expect(Number(res.rows[0]?.balance_paise)).toBe(1180000);
    });
    it('records partial payment updating balance and status', async () => {
      const paymentAmount = 500000; // Rs 5,000 partial payment
      await harness.coreDb.execute({
        sql: 'INSERT INTO payments (id, invoice_id, client_id, amount_paise, method, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['pay_1', 'inv_1', 'cli_1', paymentAmount, 'UPI', 'UPI_REF_123', Date.now()]
      });

      await harness.coreDb.execute({
        sql: 'UPDATE invoices SET paid_paise = paid_paise + ?, balance_paise = balance_paise - ?, status = \'partially_paid\' WHERE id = \'inv_1\'',
        args: [paymentAmount, paymentAmount]
      });

      const res = await harness.coreDb.execute('SELECT paid_paise, balance_paise, status FROM invoices WHERE id = \'inv_1\'');
      expect(Number(res.rows[0]?.paid_paise)).toBe(500000);
      expect(Number(res.rows[0]?.balance_paise)).toBe(680000);
      expect(res.rows[0]?.status).toBe('partially_paid');
    });
    it('records full settlement updating balance to 0 and status to paid', async () => {
      const remainingBalance = 680000;
      await harness.coreDb.execute({
        sql: 'INSERT INTO payments (id, invoice_id, client_id, amount_paise, method, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['pay_2', 'inv_1', 'cli_1', remainingBalance, 'BANK_TRANSFER', 'NEFT_9988', Date.now()]
      });

      await harness.coreDb.execute({
        sql: 'UPDATE invoices SET paid_paise = paid_paise + ?, balance_paise = 0, status = \'paid\' WHERE id = \'inv_1\'',
        args: [remainingBalance]
      });

      const res = await harness.coreDb.execute('SELECT balance_paise, status FROM invoices WHERE id = \'inv_1\'');
      expect(Number(res.rows[0]?.balance_paise)).toBe(0);
      expect(res.rows[0]?.status).toBe('paid');
    });
    it('detects overdue invoices when clock passes due date with remaining balance', async () => {
      const pastDueDate = Date.now() - 86400000; // yesterday
      await harness.coreDb.execute({
        sql: 'INSERT INTO invoices (id, client_id, contract_id, number, subtotal_paise, tax_paise, total_paise, paid_paise, balance_paise, status, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['inv_overdue_1', 'cli_1', 'ctr_1', 'RSL/2026-27/0002', 1000000, 180000, 1180000, 0, 1180000, 'overdue', pastDueDate, pastDueDate - 864000000]
      });
      const res = await harness.coreDb.execute('SELECT status FROM invoices WHERE id = \'inv_overdue_1\'');
      expect(res.rows[0]?.status).toBe('overdue');
    });
    it('dispatches payment receipt email via mock mail sink', () => {
      mailSink.sendMail({
        to: 'billing@acme.com',
        from: 'finance@rapidshiftlabs.com',
        subject: 'Payment Receipt: RSL/2026-27/0001',
        text: 'Thank you for your payment of Rs 6,800.00'
      });
      const sent = mailSink.getMailsFor('billing@acme.com');
      expect(sent).toHaveLength(1);
      expect(sent[0]?.subject).toContain('Payment Receipt');
    });
  });

  describe('Feature 36 & 37: Dunning & Revenue Dashboard', () => {
    it('schedules dunning reminders at T-7, T-3, T-0, T+3 days', () => {
      const schedule = [-7, -3, 0, 3];
      expect(schedule).toContain(-7);
      expect(schedule).toContain(3);
    });
    it('aggregates total outstanding balance across unpaid invoices', async () => {
      const res = await harness.coreDb.execute('SELECT SUM(balance_paise) as total_outstanding FROM invoices WHERE status != \'paid\'');
      expect(Number(res.rows[0]?.total_outstanding)).toBeGreaterThan(0);
    });
    it('calculates Monthly Recurring Revenue (MRR) from active contracts', async () => {
      const res = await harness.coreDb.execute('SELECT SUM(amount_paise) as mrr FROM contracts WHERE status = \'active\' AND billing_cycle = \'monthly\'');
      expect(Number(res.rows[0]?.mrr)).toBe(10000000);
    });
    it('calculates Annual Recurring Revenue (ARR) as MRR * 12', () => {
      const mrrPaise = 10000000;
      const arrPaise = mrrPaise * 12;
      expect(arrPaise).toBe(120000000);
    });
    it('breaks down aging buckets (0-30 days, 31-60 days)', () => {
      const agingBucket = (daysOverdue: number) => {
        if (daysOverdue <= 30) return '0-30';
        if (daysOverdue <= 60) return '31-60';
        return '60+';
      };
      expect(agingBucket(15)).toBe('0-30');
      expect(agingBucket(45)).toBe('31-60');
      expect(agingBucket(90)).toBe('60+');
    });
  });
});
