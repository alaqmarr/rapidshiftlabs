import NextAuth, { type NextAuthConfig, type Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { decode } from "next-auth/jwt";
import { cookies, headers } from "next/headers";
import { getIdentityModule } from "@rsl/core/identity";
import { authConfig, getAuthConfig, type AppJwtToken } from "./auth.config";
import { loginFailureLimiter } from "./lib/rate-limiter";

export type { AppJwtToken };
export { authConfig };

// In-memory cache for session versions to keep SQLite lookups sub-millisecond
const svCache = new Map<string, { sv: number; expiresAt: number }>();
const SV_CACHE_TTL_MS = 10_000;

export async function getCachedSessionVersion(
  userId: string,
  realm: "admin" | "client",
): Promise<number | null> {
  const cacheKey = `${realm}:${userId}`;
  const now = Date.now();
  const cached = svCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.sv;
  }

  const identity = getIdentityModule();
  const sv = await identity.getSessionVersion(userId, realm);
  if (sv !== null) {
    svCache.set(cacheKey, { sv, expiresAt: now + SV_CACHE_TTL_MS });
  }
  return sv;
}

export function invalidateSessionVersionCache(userId: string, realm: "admin" | "client") {
  svCache.delete(`${realm}:${userId}`);
}

export function createAuthConfig(req?: Request): NextAuthConfig {
  const base = getAuthConfig(req);
  const ip =
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req?.headers.get("x-real-ip") ||
    "127.0.0.1";

  return {
    ...base,
    providers: [
      CredentialsProvider({
        id: "admin-credentials",
        name: "Admin Credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;
          const email = String(credentials.email).toLowerCase().trim();
          const ipKey = `auth:admin:ip:${ip}`;
          const accountKey = `auth:admin:account:${email}`;
          const isLocalIp = ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
          if (!isLocalIp && !loginFailureLimiter.check(ipKey).allowed) {
            console.warn(`[auth] Admin sign-in rejected: rate limit exceeded for IP ${ip}`);
            return null;
          }
          if (!loginFailureLimiter.check(accountKey).allowed) {
            console.warn(`[auth] Admin sign-in rejected: rate limit exceeded for ${email}`);
            return null;
          }

          const identity = getIdentityModule();
          const result = await identity.verifyAdminCredentials({
            email: String(credentials.email),
            password: String(credentials.password),
          });
          if (!result.success || !result.user) {
            loginFailureLimiter.hit(ipKey);
            loginFailureLimiter.hit(accountKey);
            console.warn(`[auth] Admin sign-in failed for ${credentials.email}:`, result.error || "Invalid credentials");
            return null;
          }

          loginFailureLimiter.reset(ipKey);
          loginFailureLimiter.reset(accountKey);
          invalidateSessionVersionCache(result.user.id, "admin");

          // Locked Decision #2: Admin sign-in is EMAIL + PASSWORD ONLY.
          // Valid email + password directly yields an active admin session.
          return {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            realm: "admin" as const,
            role: result.user.role,
            supportLevel: result.user.supportLevel,
            sessionVersion: result.user.sessionVersion,
            totpVerified: true,
          };
        },
      }),

      CredentialsProvider({
        id: "client-credentials",
        name: "Client Credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;
          const email = String(credentials.email).toLowerCase().trim();
          const ipKey = `auth:client:ip:${ip}`;
          const accountKey = `auth:client:account:${email}`;
          const isLocalIp = ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
          if (!isLocalIp && !loginFailureLimiter.check(ipKey).allowed) {
            console.warn(`[auth] Client sign-in rejected: rate limit exceeded for IP ${ip}`);
            return null;
          }
          if (!loginFailureLimiter.check(accountKey).allowed) {
            console.warn(`[auth] Client sign-in rejected: rate limit exceeded for ${email}`);
            return null;
          }

          const identity = getIdentityModule();
          const result = await identity.verifyClientCredentials({
            email: String(credentials.email),
            password: String(credentials.password),
          });
          if (!result.success || !result.user) {
            loginFailureLimiter.hit(ipKey);
            loginFailureLimiter.hit(accountKey);
            console.warn(`[auth] Client sign-in failed for ${credentials.email}:`, result.error || "Invalid credentials");
            return null;
          }

          loginFailureLimiter.reset(ipKey);
          loginFailureLimiter.reset(accountKey);
          invalidateSessionVersionCache(result.user.id, "client");

          return {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            realm: "client" as const,
            role: result.user.role,
            clientId: result.user.clientId,
            sessionVersion: result.user.sessionVersion,
            totpVerified: true,
          };
        },
      }),
    ],
    callbacks: {
      ...base.callbacks,
      async jwt(params) {
        const token = (await base.callbacks?.jwt?.(params)) ?? params.token;
        if (!token) return null;

        // In Node.js environment: validate session version against database/cache
        if (token.sub && token.realm) {
          const currentSv = await getCachedSessionVersion(
            token.sub,
            token.realm as "admin" | "client",
          );
          if (currentSv === null || token.sv !== currentSv) {
            // Revoked session
            return null;
          }
        }

        return token;
      },
    },
  };
}

const nextAuthInstance = NextAuth((request) => createAuthConfig(request));

export const { handlers, signIn, signOut } = nextAuthInstance;

const CLIENT_COOKIE_CANDIDATES = [
  "__Secure-rsl.portal.session-token",
  "rsl.portal.session-token",
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

const ADMIN_COOKIE_CANDIDATES = [
  "__Secure-rsl.admin.session-token",
  "rsl.admin.session-token",
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

function tokenToSession(token: AppJwtToken & { exp?: number }): Session {
  return {
    user: {
      id: token.sub!,
      email: token.email ?? "",
      name: token.name ?? "",
      realm: token.realm!,
      role: token.role!,
      supportLevel: token.supportLevel ?? null,
      clientId: token.clientId,
      sv: token.sv ?? 1,
      sessionVersion: token.sv ?? 1,
      totpVerified: token.totpVerified ?? true,
    },
    expires: new Date(
      ((token.exp as number) || Math.floor(Date.now() / 1000) + 86400) * 1000,
    ).toISOString(),
  };
}

/**
 * Realm-aware Server Component & Route Handler session resolver.
 * When `await auth()` is called with 0 arguments in Next.js App Router Server Components,
 * `NextAuth((req) => ...)` receives `req = undefined` and cannot determine whether the page
 * is `/portal/*` (client realm) or `/admin/*` (admin realm), nor whether `__Secure-` cookies are used.
 * This wrapper reads `next/headers` (`headers()` + `cookies()`) directly and decodes the newest valid
 * JWT token for the active realm.
 */
export async function auth(...args: any[]): Promise<Session | null> {
  if (args.length > 0) {
    return (nextAuthInstance.auth as any)(...args);
  }

  try {
    const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return await nextAuthInstance.auth();
    }

    const pathname =
      headerList.get("x-rsl-pathname") ||
      headerList.get("x-invoke-path") ||
      headerList.get("x-matched-path") ||
      "";
    const referer = headerList.get("referer") || "";
    const host = headerList.get("host") || "";

    const isClientContext =
      pathname.startsWith("/portal") ||
      pathname.startsWith("/api/v1/portal") ||
      referer.includes("/portal") ||
      host.startsWith("portal.") ||
      host.startsWith("app.") ||
      (process.env.PORTAL_HOST && host === process.env.PORTAL_HOST);

    const isAdminContext =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/v1/admin") ||
      referer.includes("/admin") ||
      host.startsWith("admin.") ||
      (process.env.ADMIN_HOST && host === process.env.ADMIN_HOST);

    async function resolveBestTokenForRealm(
      targetRealm: "client" | "admin",
      candidates: string[],
    ): Promise<(AppJwtToken & { exp?: number; iat?: number }) | null> {
      let bestToken: (AppJwtToken & { exp?: number; iat?: number }) | null = null;
      let bestIat = -1;

      for (const cName of candidates) {
        const rawCookie = cookieStore.get(cName)?.value;
        if (!rawCookie) continue;
        try {
          const decoded = (await decode({
            token: rawCookie,
            secret: secret!,
            salt: cName,
          })) as (AppJwtToken & { exp?: number; iat?: number }) | null;

          if (!decoded || decoded.realm !== targetRealm || !decoded.sub) {
            continue;
          }

          const currentSv = await getCachedSessionVersion(decoded.sub, targetRealm);
          if (currentSv === null || decoded.sv !== currentSv) {
            continue;
          }

          const iat = Number(decoded.iat || 0);
          if (iat >= bestIat) {
            bestIat = iat;
            bestToken = decoded;
          }
        } catch {
          // ignore invalid/mismatched cookie & try next candidate
        }
      }

      return bestToken;
    }

    if (isClientContext) {
      const clientToken = await resolveBestTokenForRealm("client", CLIENT_COOKIE_CANDIDATES);
      return clientToken ? tokenToSession(clientToken) : null;
    }

    if (isAdminContext) {
      const adminToken = await resolveBestTokenForRealm("admin", ADMIN_COOKIE_CANDIDATES);
      return adminToken ? tokenToSession(adminToken) : null;
    }

    // Shared routes (e.g., /api/stream): resolve both and return whichever is newest
    const [clientToken, adminToken] = await Promise.all([
      resolveBestTokenForRealm("client", CLIENT_COOKIE_CANDIDATES),
      resolveBestTokenForRealm("admin", ADMIN_COOKIE_CANDIDATES),
    ]);

    if (clientToken && adminToken) {
      return Number(clientToken.iat || 0) >= Number(adminToken.iat || 0)
        ? tokenToSession(clientToken)
        : tokenToSession(adminToken);
    }
    if (clientToken) return tokenToSession(clientToken);
    if (adminToken) return tokenToSession(adminToken);

    return null;
  } catch {
    return await nextAuthInstance.auth();
  }
}
