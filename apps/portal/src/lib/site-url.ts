/**
 * Dynamic Site Origin & Domain Resolution Helper
 * Automatically uses the active browser origin in client components, or
 * NEXT_PUBLIC_APP_URL / AUTH_URL (defaulting to https://rsl.alaqmar.dev) on the server.
 * When migrating to a new domain in the future, snippets and embeds adapt automatically.
 */

export const DEFAULT_PRODUCTION_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  process.env.AUTH_URL ||
  "https://rsl.alaqmar.dev";

export function getSiteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_PRODUCTION_ORIGIN.replace(/\/+$/, "");
}

export function getRequestOrigin(req?: Request): string {
  if (req) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (host) {
      return `${proto}://${host}`;
    }
    try {
      return new URL(req.url).origin;
    } catch {
      // fall through
    }
  }
  return DEFAULT_PRODUCTION_ORIGIN.replace(/\/+$/, "");
}
