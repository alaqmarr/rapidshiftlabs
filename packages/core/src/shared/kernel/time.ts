/** Clock port: inject for deterministic tests. All timestamps are UTC epoch milliseconds. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Business timezone default (IST). Client-specific timezones override this. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** Returns YYYY-MM-DD for an epoch in the given IANA timezone. */
export function toDateKey(epochMs: number, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(epochMs),
  );
  return parts; // en-CA yields YYYY-MM-DD
}

/** Parse a YYYY-MM-DD calendar date as midnight in the given timezone → epoch ms. */
export function fromDateKey(dateKey: string, timeZone = DEFAULT_TIMEZONE): number {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const utcGuess = Date.UTC(y, m - 1, d);
  const offset = tzOffsetMs(utcGuess, timeZone);
  return utcGuess - offset;
}

/** Offset of `timeZone` from UTC at a given instant, in ms. */
export function tzOffsetMs(epochMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(epochMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Add calendar months to a YYYY-MM-DD key, clamping to month end (Jan 31 + 1M = Feb 28/29). */
export function addMonthsToDateKey(dateKey: string, months: number, anchorDay?: number): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTarget = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay ?? d, daysInTarget);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / DAY);
}

export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Indian financial year label for a date key: 2026-10-10 → "2026-27". */
export function financialYear(dateKey: string): string {
  const [y, m] = dateKey.split("-").map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function isoOrNull(epochMs: number | null | undefined): string | null {
  return epochMs == null ? null : new Date(epochMs).toISOString();
}
