/**
 * RapidShift Labs Test Oracles
 * Authoritative, deterministic derivation of expected domain outputs.
 */

export interface GstBreakdown {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  taxPaise: number;
}

export class TestOracle {
  /**
   * Authoritative GST tax calculation oracle.
   * Intra-state: 9% CGST + 9% SGST.
   * Inter-state: 18% IGST.
   * Non-GST mode: 0% tax.
   */
  static calculateGst(subtotalPaise: number, isIntraState: boolean, isGstConfigured: boolean): GstBreakdown {
    if (!isGstConfigured || subtotalPaise <= 0) {
      return {
        subtotalPaise,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        taxPaise: 0,
        totalPaise: subtotalPaise
      };
    }

    if (isIntraState) {
      const cgstPaise = Math.round(subtotalPaise * 0.09);
      const sgstPaise = Math.round(subtotalPaise * 0.09);
      const taxPaise = cgstPaise + sgstPaise;
      return {
        subtotalPaise,
        cgstPaise,
        sgstPaise,
        igstPaise: 0,
        taxPaise,
        totalPaise: subtotalPaise + taxPaise
      };
    } else {
      const igstPaise = Math.round(subtotalPaise * 0.18);
      return {
        subtotalPaise,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise,
        taxPaise: igstPaise,
        totalPaise: subtotalPaise + igstPaise
      };
    }
  }

  /**
   * Financial Year string oracle (e.g. 2026-27).
   * Indian FY runs April 1 to March 31.
   */
  static deriveFinancialYear(date: Date): string {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth(); // 0-indexed: April is 3
    if (month >= 3) {
      const nextYearTwoDigits = ((year + 1) % 100).toString().padStart(2, '0');
      return `${year}-${nextYearTwoDigits}`;
    } else {
      const currentYearTwoDigits = (year % 100).toString().padStart(2, '0');
      return `${year - 1}-${currentYearTwoDigits}`;
    }
  }

  /**
   * Invoice sequential number oracle: RSL/2026-27/0001 or RSL-NG/2026-27/0001.
   */
  static formatInvoiceNumber(prefix: string, date: Date, sequence: number): string {
    const fy = this.deriveFinancialYear(date);
    const seqPadded = sequence.toString().padStart(4, '0');
    return `${prefix}/${fy}/${seqPadded}`;
  }

  /**
   * Month-end date clamping oracle.
   * If anchor day is 31 and month has 28 days (February), clamp to 28.
   */
  static clampMonthEndDay(year: number, monthIndex0: number, targetAnchorDay: number): Date {
    // 0th day of next month gives last day of current month
    const daysInCurrentMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
    const clampedDay = Math.min(targetAnchorDay, daysInCurrentMonth);
    return new Date(Date.UTC(year, monthIndex0, clampedDay));
  }

  /**
   * 24x7 SLA target calculation oracle.
   */
  static calculateSlaDeadline(createdAt: Date, slaDurationMinutes: number, pausePeriodsMs: number = 0): Date {
    const totalMs = createdAt.getTime() + (slaDurationMinutes * 60 * 1000) + pausePeriodsMs;
    return new Date(totalMs);
  }
}
