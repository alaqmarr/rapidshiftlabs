import { DomainRuleError } from "./errors";

/**
 * Money value object. Always stored as INTEGER minor units (paise for INR)
 * to avoid floating point drift. Immutable.
 */
export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD" | "AUD" | "CAD";

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

export interface MoneyDTO {
  /** Amount in minor units (e.g. paise). */
  amount: number;
  currency: CurrencyCode;
  /** Human readable, locale formatted (e.g. "₹1,18,000.00"). */
  formatted: string;
}

export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: CurrencyCode,
  ) {
    if (!Number.isSafeInteger(amount)) {
      throw new DomainRuleError("money_invalid", "Money amount must be an integer number of minor units");
    }
  }

  static of(amountMinor: number, currency: CurrencyCode): Money {
    return new Money(Math.round(amountMinor), currency);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0, currency);
  }

  /** Build from a major-unit decimal (e.g. 1499.50 → 149950). */
  static fromMajor(major: number, currency: CurrencyCode): Money {
    return new Money(Math.round(major * 100), currency);
  }

  private assertSame(other: Money) {
    if (other.currency !== this.currency) {
      throw new DomainRuleError("currency_mismatch", `Cannot combine ${this.currency} with ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSame(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSame(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  /** Percentage in basis points (1800 = 18%). Uses banker-safe half-up rounding. */
  percentBps(bps: number): Money {
    return new Money(Math.round((this.amount * bps) / 10000), this.currency);
  }

  /** Split into n parts whose sum equals the original (remainder spread on the first parts). */
  allocate(parts: number): Money[] {
    const base = Math.floor(this.amount / parts);
    let remainder = this.amount - base * parts;
    return Array.from({ length: parts }, () => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return new Money(base + extra, this.currency);
    });
  }

  isZero() {
    return this.amount === 0;
  }
  isPositive() {
    return this.amount > 0;
  }
  isNegative() {
    return this.amount < 0;
  }
  equals(other: Money) {
    return this.currency === other.currency && this.amount === other.amount;
  }
  greaterThan(other: Money) {
    this.assertSame(other);
    return this.amount > other.amount;
  }

  toMajor(): number {
    return this.amount / 100;
  }

  format(locale = this.currency === "INR" ? "en-IN" : "en-US"): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency: this.currency }).format(this.toMajor());
  }

  toDTO(): MoneyDTO {
    return { amount: this.amount, currency: this.currency, formatted: this.format() };
  }
}

export function moneyDTO(amountMinor: number, currency: CurrencyCode): MoneyDTO {
  return Money.of(amountMinor, currency).toDTO();
}
