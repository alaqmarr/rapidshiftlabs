/**
 * RapidShift Universal Deterministic Currency Engine
 * Provides deterministic currency formatting and amount-in-words without
 * SSR / client hydration mismatches.
 */

export type SupportedCurrency =
  | "INR"
  | "USD"
  | "EUR"
  | "GBP"
  | "AED"
  | "SGD"
  | "CAD"
  | "AUD"
  | "JPY"
  | "CHF";

export interface CurrencyMetadata {
  code: SupportedCurrency;
  symbol: string;
  name: string;
  fractionUnit: string;
  minorFactor: number;
  placement: "prefix" | "suffix" | "prefix-space";
  grouping: "indian" | "western";
}

export const CURRENCY_METADATA: Record<SupportedCurrency, CurrencyMetadata> = {
  INR: {
    code: "INR",
    symbol: "₹",
    name: "Indian Rupee",
    fractionUnit: "Paise",
    minorFactor: 100,
    placement: "prefix",
    grouping: "indian",
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    fractionUnit: "Cents",
    minorFactor: 100,
    placement: "prefix",
    grouping: "western",
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    name: "Euro",
    fractionUnit: "Cents",
    minorFactor: 100,
    placement: "prefix",
    grouping: "western",
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    name: "British Pound",
    fractionUnit: "Pence",
    minorFactor: 100,
    placement: "prefix",
    grouping: "western",
  },
  AED: {
    code: "AED",
    symbol: "AED",
    name: "UAE Dirham",
    fractionUnit: "Fils",
    minorFactor: 100,
    placement: "prefix-space",
    grouping: "western",
  },
  SGD: {
    code: "SGD",
    symbol: "S$",
    name: "Singapore Dollar",
    fractionUnit: "Cents",
    minorFactor: 100,
    placement: "prefix",
    grouping: "western",
  },
  CAD: {
    code: "CAD",
    symbol: "CA$",
    name: "Canadian Dollar",
    fractionUnit: "Cents",
    minorFactor: 100,
    placement: "prefix",
    grouping: "western",
  },
  AUD: {
    code: "AUD",
    symbol: "A$",
    name: "Australian Dollar",
    fractionUnit: "Cents",
    minorFactor: 100,
    placement: "prefix",
    grouping: "western",
  },
  JPY: {
    code: "JPY",
    symbol: "¥",
    name: "Japanese Yen",
    fractionUnit: "Sen",
    minorFactor: 1, // JPY has no minor fraction in standard practice
    placement: "prefix",
    grouping: "western",
  },
  CHF: {
    code: "CHF",
    symbol: "CHF",
    name: "Swiss Franc",
    fractionUnit: "Rappen",
    minorFactor: 100,
    placement: "prefix-space",
    grouping: "western",
  },
};

export const SUPPORTED_CURRENCY_LIST: CurrencyMetadata[] = Object.values(CURRENCY_METADATA);
export const SUPPORTED_CURRENCY_METAS: CurrencyMetadata[] = Object.values(CURRENCY_METADATA);

export function getCurrencyMeta(currency: string = "INR"): CurrencyMetadata {
  const norm = currency?.toUpperCase() as SupportedCurrency;
  return CURRENCY_METADATA[norm] || CURRENCY_METADATA.INR;
}

export function getCurrencySymbol(currency: string = "INR"): string {
  return getCurrencyMeta(currency).symbol;
}

/**
 * Format Indian Lakhs / Crores numeric string deterministically (e.g. 12,34,567)
 */
function formatIndianGrouping(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const remaining = intStr.slice(0, -3);
  const groups: string[] = [];
  let rem = remaining;
  while (rem.length > 2) {
    groups.unshift(rem.slice(-2));
    rem = rem.slice(0, -2);
  }
  if (rem.length > 0) groups.unshift(rem);
  return `${groups.join(",")},${last3}`;
}

/**
 * Format Western thousands numeric string deterministically (e.g. 1,234,567)
 */
function formatWesternGrouping(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface FormatCurrencyOptions {
  includeDecimals?: boolean;
  showCode?: boolean;
  forceDecimals?: boolean;
}

/**
 * Format minor units into clean, beautiful currency string.
 * Example:
 * formatCurrency(1500000, "INR") => "₹15,000"
 * formatCurrency(1500050, "INR") => "₹15,000.50"
 * formatCurrency(1500000, "USD") => "$15,000"
 * formatCurrency(1500050, "USD") => "$15,000.50"
 * formatCurrency(1500000, "INR", { forceDecimals: true }) => "₹15,000.00"
 */
export function formatCurrency(
  amountMinor: number | undefined | null,
  currency: string = "INR",
  options?: FormatCurrencyOptions,
): string {
  if (amountMinor === undefined || amountMinor === null || isNaN(amountMinor)) {
    amountMinor = 0;
  }

  const meta = getCurrencyMeta(currency);
  const isNegative = amountMinor < 0;
  const absMinor = Math.abs(Math.round(amountMinor));

  const major = Math.floor(absMinor / meta.minorFactor);
  const remainder = absMinor % meta.minorFactor;

  const intString = major.toString();
  const formattedInt =
    meta.grouping === "indian"
      ? formatIndianGrouping(intString)
      : formatWesternGrouping(intString);

  let formattedAmount = formattedInt;

  const shouldShowDecimals =
    meta.minorFactor > 1 &&
    (options?.forceDecimals ||
      (options?.includeDecimals !== false && remainder > 0));

  if (shouldShowDecimals) {
    const fractionPad = remainder.toString().padStart(2, "0");
    formattedAmount += `.${fractionPad}`;
  }

  let result = "";
  if (meta.placement === "prefix") {
    result = `${meta.symbol}${formattedAmount}`;
  } else if (meta.placement === "prefix-space") {
    result = `${meta.symbol} ${formattedAmount}`;
  } else {
    result = `${formattedAmount} ${meta.symbol}`;
  }

  if (options?.showCode) {
    result = `${result} ${meta.code}`;
  }

  return isNegative ? `-${result}` : result;
}

// Number to Words Converter for Legal Invoices & Contracts
const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function convertThreeDigits(num: number): string {
  let str = "";
  if (num >= 100) {
    str += `${ONES[Math.floor(num / 100)]} Hundred `;
    num %= 100;
  }
  if (num >= 20) {
    str += `${TENS[Math.floor(num / 10)]} `;
    num %= 10;
  }
  if (num > 0) {
    str += `${ONES[num]} `;
  }
  return str.trim();
}

/**
 * Converts numeric amount to legal words for invoices.
 * e.g., 1500000 minor in INR => "Fifteen Thousand Rupees Only"
 */
export function amountInWords(amountMinor: number, currency: string = "INR"): string {
  if (amountMinor === 0) return "Zero Only";
  const meta = getCurrencyMeta(currency);
  const major = Math.floor(Math.abs(amountMinor) / meta.minorFactor);
  const minor = Math.abs(amountMinor) % meta.minorFactor;

  let words = "";

  if (meta.grouping === "indian") {
    // Indian numbering: Crores, Lakhs, Thousands, Hundreds
    let n = major;
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const remainder = n;

    if (crore > 0) words += `${convertThreeDigits(crore)} Crore `;
    if (lakh > 0) words += `${convertThreeDigits(lakh)} Lakh `;
    if (thousand > 0) words += `${convertThreeDigits(thousand)} Thousand `;
    if (remainder > 0) words += `${convertThreeDigits(remainder)} `;
  } else {
    // Western numbering: Billions, Millions, Thousands, Hundreds
    let n = major;
    const billion = Math.floor(n / 1000000000);
    n %= 1000000000;
    const million = Math.floor(n / 1000000);
    n %= 1000000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const remainder = n;

    if (billion > 0) words += `${convertThreeDigits(billion)} Billion `;
    if (million > 0) words += `${convertThreeDigits(million)} Million `;
    if (thousand > 0) words += `${convertThreeDigits(thousand)} Thousand `;
    if (remainder > 0) words += `${convertThreeDigits(remainder)} `;
  }

  words = words.trim();
  const majorUnitName = meta.code === "INR" ? (major === 1 ? "Rupee" : "Rupees") : meta.name;

  let result = words ? `${words} ${majorUnitName}` : "";

  if (minor > 0 && meta.minorFactor > 1) {
    const minorWords = convertThreeDigits(minor);
    result += result ? ` and ${minorWords} ${meta.fractionUnit}` : `${minorWords} ${meta.fractionUnit}`;
  }

  return `${result.trim()} Only`;
}
