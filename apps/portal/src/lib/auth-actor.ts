import { auth, getCachedSessionVersion } from "@/auth";
import { getToken } from "next-auth/jwt";
import type { Actor, AdminRole, ClientRole } from "@rsl/core/kernel";
import { getContainer } from "@rsl/core/container";

export async function getRequestActor(req?: Request): Promise<Actor | null> {
  // 1. Check API key header, Bearer token, or query parameter (?apiKey= / ?key= / ?token=)
  if (req) {
    const authHeader =
      req.headers.get("authorization") ||
      req.headers.get("x-api-key") ||
      req.headers.get("x-publishable-key");
    let rawKey = authHeader?.replace(/^Bearer\s+/i, "")?.trim() || "";

    if (!rawKey && req.url) {
      try {
        const url = new URL(req.url);
        const queryKey =
          url.searchParams.get("apiKey") ||
          url.searchParams.get("api_key") ||
          url.searchParams.get("key") ||
          url.searchParams.get("token");
        if (queryKey && (queryKey.startsWith("rsk_") || queryKey.startsWith("rpk_"))) {
          rawKey = queryKey.trim();
        }
      } catch {
        // ignore URL parse issues
      }
    }

    if (rawKey && (rawKey.startsWith("rsk_") || rawKey.startsWith("rpk_"))) {
      const container = getContainer();
      const res = await container.apiPlatformModule.validateApiKey(rawKey);
      if (res && res.valid && res.keyId && res.clientId) {
        return {
          kind: "api_key",
          id: res.keyId,
          clientId: res.clientId,
          scopes: (res.scopes || []) as any,
          keyType: res.keyType || "secret",
        };
      }
    }

    // 2. Direct JWT token inspection with candidate cookie names
    const referer = req.headers.get("referer") || "";
    const reqUrl = req.url || "";
    const isClientContext =
      referer.includes("/portal") ||
      reqUrl.includes("/api/v1/portal") ||
      reqUrl.includes("/portal");
    const isAdminContext =
      referer.includes("/admin") ||
      reqUrl.includes("/api/v1/admin") ||
      reqUrl.includes("/admin");

    const clientCookies = [
      "__Secure-rsl.portal.session-token",
      "rsl.portal.session-token",
      "__Secure-authjs.session-token",
      "authjs.session-token",
    ];

    const adminCookies = [
      "__Secure-rsl.admin.session-token",
      "rsl.admin.session-token",
      "__Secure-authjs.session-token",
      "authjs.session-token",
    ];

    async function tryGetAdminToken() {
      let bestToken: any = null;
      let bestIat = -1;
      for (const cName of adminCookies) {
        try {
          const token = await getToken({
            req: req as any,
            secret: process.env.AUTH_SECRET,
            cookieName: cName,
            salt: cName,
          });
          if (token && token.realm === "admin" && token.sub) {
            const currentSv = await getCachedSessionVersion(String(token.sub), "admin");
            if (currentSv === null || token.sv !== currentSv) continue;
            const iat = Number(token.iat || 0);
            if (iat >= bestIat) {
              bestIat = iat;
              bestToken = token;
            }
          }
        } catch {
          // ignore & try next
        }
      }
      return bestToken;
    }

    async function tryGetClientToken() {
      let bestToken: any = null;
      let bestIat = -1;
      for (const cName of clientCookies) {
        try {
          const token = await getToken({
            req: req as any,
            secret: process.env.AUTH_SECRET,
            cookieName: cName,
            salt: cName,
          });
          if (token && token.realm === "client" && token.sub) {
            const currentSv = await getCachedSessionVersion(String(token.sub), "client");
            if (currentSv === null || token.sv !== currentSv) continue;
            const iat = Number(token.iat || 0);
            if (iat >= bestIat) {
              bestIat = iat;
              bestToken = token;
            }
          }
        } catch {
          // ignore & try next
        }
      }
      return bestToken;
    }

    function toClientActor(clientToken: any): Actor {
      return {
        kind: "client_user",
        id: (clientToken.sub as string) || "user",
        email: (clientToken.email as string) || "",
        name: (clientToken.name as string) || "Client User",
        clientId: (clientToken.clientId as string) || "",
        role: (clientToken.role as ClientRole) || "client_admin",
      };
    }

    function toAdminActor(adminToken: any): Actor {
      return {
        kind: "admin",
        id: (adminToken.sub as string) || "admin",
        email: (adminToken.email as string) || "",
        name: (adminToken.name as string) || "Admin User",
        role: (adminToken.role as AdminRole) || "owner",
        supportLevel: (adminToken.supportLevel as any) ?? null,
      };
    }

    if (isClientContext && !isAdminContext) {
      const clientToken = await tryGetClientToken();
      if (clientToken) return toClientActor(clientToken);
      const adminToken = await tryGetAdminToken();
      if (adminToken) return toAdminActor(adminToken);
    } else if (isAdminContext && !isClientContext) {
      const adminToken = await tryGetAdminToken();
      if (adminToken) return toAdminActor(adminToken);
      const clientToken = await tryGetClientToken();
      if (clientToken) return toClientActor(clientToken);
    } else {
      const [clientToken, adminToken] = await Promise.all([
        tryGetClientToken(),
        tryGetAdminToken(),
      ]);
      if (clientToken && adminToken) {
        return Number(clientToken.iat || 0) >= Number(adminToken.iat || 0)
          ? toClientActor(clientToken)
          : toAdminActor(adminToken);
      }
      if (adminToken) return toAdminActor(adminToken);
      if (clientToken) return toClientActor(clientToken);
    }
  }

  // 3. Fallback to standard NextAuth session
  const session = await auth();
  if (session?.user) {
    const user = session.user as any;
    if (user.realm === "client") {
      return {
        kind: "client_user",
        id: user.id || user.sub || "user",
        email: user.email || "",
        name: user.name || "Client User",
        clientId: user.clientId || "",
        role: (user.role as ClientRole) || "client_admin",
      };
    } else {
      return {
        kind: "admin",
        id: user.id || user.sub || "admin",
        email: user.email || "",
        name: user.name || "Admin User",
        role: (user.role as AdminRole) || "owner",
        supportLevel: user.supportLevel ?? null,
      };
    }
  }

  return null;
}
