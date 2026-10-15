import { formatCurrency, getCurrencyMeta, getCurrencySymbol, type SupportedCurrency } from "./currency";

export { formatCurrency, getCurrencyMeta, getCurrencySymbol, type SupportedCurrency };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Deterministic date formatter: '26 Oct 2026'
 * Prevents SSR / client locale hydration mismatches.
 */
export function formatDate(input: number | string | Date | undefined | null): string {
  if (!input) return "—";
  const d = typeof input === "object" && input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Deterministic time formatter: '14:30'
 * Prevents 12h vs 24h hydration mismatches.
 */
export function formatTime(input: number | string | Date | undefined | null): string {
  if (!input) return "—";
  const d = typeof input === "object" && input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "—";
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${mins}`;
}

/**
 * Deterministic date-time formatter: '26 Oct 2026, 14:30'
 * Prevents SSR / client locale hydration mismatches.
 */
export function formatDateTime(input: number | string | Date | undefined | null): string {
  if (!input) return "—";
  const d = typeof input === "object" && input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${mins}`;
}

/**
 * Deterministic number/count grouping (e.g. 1,234,567)
 * Prevents browser-dependent thousands separators from failing hydration.
 */
export function formatCount(input: number | string | undefined | null): string {
  if (input === undefined || input === null || input === "") return "0";
  const num = typeof input === "number" ? input : Number(input);
  if (isNaN(num)) return "0";
  const [intPart, decPart] = num.toString().split(".");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}
