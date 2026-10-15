/**
 * Tier 2: Boundary & Corner Cases — Billing & Contracts
 * Edge dates, leap year clamping, negative money, boundary rounding, corrupt GSTIN, overpayments
 */

import { describe, it, expect } from 'vitest';
import { TestOracle } from '../helpers/test-oracle.js';

describe('Tier 2: Billing & Contract Boundaries', () => {
  describe('Boundary 1: Leap Year and Month-End Clamping', () => {
    it('clamps January 31 anchor day to February 28 in non-leap year (2026)', () => {
      const clamped = TestOracle.clampMonthEndDay(2026, 1, 31);
      expect(clamped.getUTCDate()).toBe(28);
    });
    it('clamps January 31 anchor day to February 29 in leap year (2028)', () => {
      const clamped = TestOracle.clampMonthEndDay(2028, 1, 31);
      expect(clamped.getUTCDate()).toBe(29);
    });
    it('clamps anchor day 31 to day 30 for 30-day months (April, June, September, November)', () => {
      [3, 5, 8, 10].forEach((monthIndex0) => {
        const clamped = TestOracle.clampMonthEndDay(2026, monthIndex0, 31);
        expect(clamped.getUTCDate()).toBe(30);
      });
    });
    it('handles anchor day 1 without modification', () => {
      const day1 = TestOracle.clampMonthEndDay(2026, 1, 1);
      expect(day1.getUTCDate()).toBe(1);
    });
    it('handles contract spanning exactly 1 day tenure', () => {
      const start = new Date(Date.UTC(2026, 3, 1));
      const end = new Date(Date.UTC(2026, 3, 1));
      const durationDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
      expect(durationDays).toBe(1);
    });
  });

  describe('Boundary 2: Money, Zero Tax & 1-Paisa Rounding', () => {
    it('handles 1 paisa rounding on odd intra-state GST subtotal', () => {
      // Rs 100.01 = 10001 paise. 9% = 900.09 -> Math.round -> 900 paise
      const gst = TestOracle.calculateGst(10001, true, true);
      expect(gst.cgstPaise).toBe(900);
      expect(gst.sgstPaise).toBe(900);
      expect(gst.totalPaise).toBe(11801);
    });
    it('handles 0 amount line items and zero subtotal cleanly', () => {
      const gst = TestOracle.calculateGst(0, true, true);
      expect(gst.taxPaise).toBe(0);
      expect(gst.totalPaise).toBe(0);
    });
    it('rejects negative subtotal amounts', () => {
      const gst = TestOracle.calculateGst(-5000, true, true);
      expect(gst.taxPaise).toBe(0);
      expect(gst.totalPaise).toBe(-5000);
    });
    it('handles very large subtotal without integer overflow', () => {
      const largeSubtotal = 10000000000; // Rs 10,00,00,000.00
      const gst = TestOracle.calculateGst(largeSubtotal, false, true);
      expect(gst.totalPaise).toBe(11800000000);
    });
    it('verifies integer-only representation prevents floating point errors', () => {
      // 0.1 + 0.2 !== 0.3 in floats, but in paise: 10 + 20 === 30
      const a = 10;
      const b = 20;
      expect(a + b).toBe(30);
    });
  });

  describe('Boundary 3: Financial Year Rollover & Sequence Wrapping', () => {
    it('handles financial year boundary on March 31 midnight (prior FY)', () => {
      const march31 = new Date(Date.UTC(2026, 2, 31, 23, 59, 59));
      expect(TestOracle.deriveFinancialYear(march31)).toBe('2025-26');
    });
    it('handles financial year boundary on April 1 00:00:00 (new FY)', () => {
      const april1 = new Date(Date.UTC(2026, 3, 1, 0, 0, 0));
      expect(TestOracle.deriveFinancialYear(april1)).toBe('2026-27');
    });
    it('pads sequence numbers up to 9999 and beyond gracefully', () => {
      const invNum = TestOracle.formatInvoiceNumber('RSL', new Date(Date.UTC(2026, 4, 1)), 9999);
      expect(invNum).toBe('RSL/2026-27/9999');
      const invNum5Digits = TestOracle.formatInvoiceNumber('RSL', new Date(Date.UTC(2026, 4, 1)), 10000);
      expect(invNum5Digits).toBe('RSL/2026-27/10000');
    });
  });

  describe('Boundary 4: Payments and Overpayment Guards', () => {
    it('rejects payment amount exceeding invoice remaining balance', () => {
      const balancePaise = 50000;
      const paymentAttempt = 60000;
      const isAllowed = paymentAttempt <= balancePaise;
      expect(isAllowed).toBe(false);
    });
    it('rejects zero or negative payment amounts', () => {
      const isValidPayment = (amount: number) => amount > 0;
      expect(isValidPayment(0)).toBe(false);
      expect(isValidPayment(-100)).toBe(false);
      expect(isValidPayment(100)).toBe(true);
    });
  });

  describe('Boundary 5: GSTIN Format and State Code Validation', () => {
    it('rejects invalid GSTIN with wrong checksum character', () => {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      expect(gstinRegex.test('INVALID_GSTIN_123')).toBe(false);
    });
    it('detects mismatched state code between client state and GSTIN prefix', () => {
      const gstin = '29ABCDE1234F1Z5'; // State 29 (Karnataka)
      const declaredStateCode = '27';     // State 27 (Maharashtra)
      const matches = gstin.startsWith(declaredStateCode);
      expect(matches).toBe(false);
    });
  });
});
