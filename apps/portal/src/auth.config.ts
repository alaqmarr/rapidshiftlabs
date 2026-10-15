import type { NextAuthConfig } from "next-auth";
import type { AdminRole, ClientRole } from "@rsl/core/kernel";

export interface AppJwtToken {
  sub?: string;
  email?: string;
  name?: string;
  realm?: "admin" | "client";
  role?: AdminRole | ClientRole;
  supportLevel?: 1 | 2 | 3 | null;
  clientId?: string;
  sv?: number;
  totpVerified?: boolean;
}

export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export interface RequestLike {
  nextUrl?: { pathname?: string; host?: string };
  url?: string;
  headers?: Headers | { get?(name: string): string | null };
}

export function getAuthConfig(req?: Request | RequestLike): NextAuthConfig {
  let isHttps = false;
  let pathname = "";
  let host = "";
  let cookieHeader = "";
  let referer = "";

  if (req) {
    const reqLike = req as RequestLike;
    if (reqLike.nextUrl) {
      pathname = reqLike.nextUrl.pathname || "";
      host = reqLike.nextUrl.host || reqLike.headers?.get?.("host") || "";
    } else if (reqLike.url) {
      try {
        const u = new URL(reqLike.url, "http://localhost");
        pathname = u.pathname;
        host = u.host || reqLike.headers?.get?.("host") || "";
      } catch {
        // ignore malformed URL
      }
    }

    if (reqLike.headers?.get) {
      if (!host) host = reqLike.headers.get("host") || "";
      cookieHeader = reqLike.headers.get("cookie") || "";
      referer = reqLike.headers.get("referer") || "";
      const proto = reqLike.headers.get("x-forwarded-proto") || "";
      if (proto === "https" || reqLike.url?.startsWith("https://")) {
        isHttps = true;
      }
    }
  }

  const isSecure = process.env.NODE_ENV === "production" && isHttps;

  // Determine active realm from request host, pathname, or cookies
  let isClientRealm = false;
  const portalHost = process.env.PORTAL_HOST;
  if (portalHost && host === portalHost) {
    isClientRealm = true;
  } else if (
    host.startsWith("app.") ||
    host.startsWith("portal.") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/api/v1/portal") ||
    pathname.includes("client-credentials") ||
    referer.includes("/portal") ||
    (cookieHeader.includes("rsl.portal.session-token") &&
      !cookieHeader.includes("rsl.admin.session-token"))
  ) {
    isClientRealm = true;
  }

  let cookiePrefix = isSecure ? "__Secure-" : "";
  if (cookieHeader.includes("__Secure-rsl.admin.session-token") && !isClientRealm) {
    cookiePrefix = "__Secure-";
  } else if (cookieHeader.includes("__Secure-rsl.portal.session-token") && isClientRealm) {
    cookiePrefix = "__Secure-";
  }

  const sessionCookieName = isClientRealm
    ? `${cookiePrefix}rsl.portal.session-token`
    : `${cookiePrefix}rsl.admin.session-token`;

  return {
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE,
    },
    cookies: {
      sessionToken: {
        name: sessionCookieName,
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: isSecure,
        },
      },
    },
    pages: {
      signIn: isClientRealm ? "/portal/login" : "/admin/login",
      error: isClientRealm ? "/portal/login" : "/admin/login",
    },
    providers: [],
    callbacks: {
      async jwt({ token, user, trigger, session }) {
        if (user) {
          token.sub = user.id;
          token.email = user.email;
          token.name = user.name;
          token.realm = user.realm;
          token.role = user.role;
          token.supportLevel = user.supportLevel;
          token.clientId = user.clientId;
          token.sv = user.sessionVersion;
          token.totpVerified = user.totpVerified ?? true;
          return token;
        }

        if (trigger === "update" && session) {
          if (typeof session.totpVerified === "boolean") {
            token.totpVerified = session.totpVerified;
          }
          if (session.name) token.name = session.name;
          if (typeof session.sv === "number") token.sv = session.sv;
        }

        return token;
      },

      async session({ session, token }) {
        const appToken = token as AppJwtToken;
        if (appToken && appToken.sub && appToken.realm && appToken.role) {
          session.user = {
            ...session.user,
            id: appToken.sub,
            email: appToken.email ?? "",
            name: appToken.name ?? "",
            realm: appToken.realm,
            role: appToken.role,
            supportLevel: appToken.supportLevel ?? null,
            clientId: appToken.clientId,
            sv: appToken.sv ?? 1,
            totpVerified: appToken.totpVerified ?? true,
          };
        }
        return session;
      },
    },
  };
}

export type AuthConfigFn = ((req?: Request | RequestLike) => NextAuthConfig) & NextAuthConfig;

export const authConfig: AuthConfigFn = Object.assign(
  (req?: Request | RequestLike) => getAuthConfig(req),
  getAuthConfig(),
);

export default authConfig;
