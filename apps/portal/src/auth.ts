import NextAuth, { type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getIdentityModule } from "@rsl/core/identity";
import { authConfig, getAuthConfig, type AppJwtToken } from "./auth.config";
import { loginFailureLimiter } from "./lib/rate-limiter";

export type { AppJwtToken };
export { authConfig };

// In-memory cache for session versions to keep SQLite lookups sub-millisecond
const svCache = new Map<string, { sv: number; expiresAt: number }>();
const SV_CACHE_TTL_MS = 30_000;

async function getCachedSessionVersion(
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

export const { handlers, auth, signIn, signOut } = NextAuth((request) =>
  createAuthConfig(request),
);
