import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATH_PATTERNS = [
  /^\/_next/,
  /^\/favicon\.ico$/,
  /^\/t\.js$/,
  /^\/embed\.js$/,
  /^\/api\/auth/,
  /^\/api\/v1\/health$/,
  /^\/api\/v1\/access\/status$/,
  /^\/api\/v1\/embed-actions$/,
  /^\/api\/v1\/client\/data$/,
  /^\/api\/collect/,
  /^\/api\/stream/,
  /^\/\.well-known/,
  /^\/status(\/.*)?$/,
  /^\/embed(\/.*)?$/,
  /^\/docs(\/.*)?$/,
  /^\/openapi\.json$/,
  /^\/login$/,
];

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-rsl-pathname", pathname);

  // Imperatively bypass public assets, static files, and public APIs
  for (const pattern of PUBLIC_PATH_PATTERNS) {
    if (pattern.test(pathname)) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  const host = req.headers.get("host") || "";
  const url = req.nextUrl.clone();

  // 1. Host-Based Routing (production or subdomain-based dev)
  const adminHost = process.env.ADMIN_HOST;
  const portalHost = process.env.PORTAL_HOST;
  const apiHost = process.env.API_HOST;

  const isAdminHost = (adminHost && host === adminHost) || host.startsWith("admin.");
  const isPortalHost = (portalHost && host === portalHost) || host.startsWith("app.") || host.startsWith("portal.");
  const isApiHost = (apiHost && host === apiHost) || host.startsWith("api.");

  if (isApiHost) {
    if (pathname.startsWith("/admin") || pathname.startsWith("/portal")) {
      return new NextResponse("Not Found", { status: 404 });
    }
    return NextResponse.next();
  }

  if (isAdminHost) {
    if (pathname === "/" || pathname === "/admin/dashboard") {
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/portal")) {
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  if (isPortalHost) {
    if (pathname === "/" || pathname === "/portal/overview") {
      url.pathname = "/portal";
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/admin")) {
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  // Session verification using cryptographically verified NextAuth JWT tokens
  const adminCookieCandidates = [
    "__Secure-rsl.admin.session-token",
    "rsl.admin.session-token",
    "__Secure-authjs.session-token",
    "authjs.session-token",
  ];

  let adminToken: any = null;
  let bestAdminIat = -1;
  for (const cName of adminCookieCandidates) {
    if (req.cookies.has(cName)) {
      try {
        const token = await getToken({
          req,
          secret: process.env.AUTH_SECRET,
          cookieName: cName,
          salt: cName,
        });
        if (token && token.realm === "admin") {
          const iat = Number(token.iat || 0);
          if (iat >= bestAdminIat) {
            bestAdminIat = iat;
            adminToken = token;
          }
        }
      } catch {
        // try next
      }
    }
  }
  const hasAdminSession = Boolean(adminToken);

  const clientCookieCandidates = [
    "__Secure-rsl.portal.session-token",
    "rsl.portal.session-token",
    "__Secure-authjs.session-token",
    "authjs.session-token",
  ];

  let clientToken: any = null;
  let bestClientIat = -1;
  for (const cName of clientCookieCandidates) {
    if (req.cookies.has(cName)) {
      try {
        const token = await getToken({
          req,
          secret: process.env.AUTH_SECRET,
          cookieName: cName,
          salt: cName,
        });
        if (token && token.realm === "client") {
          const iat = Number(token.iat || 0);
          if (iat >= bestClientIat) {
            bestClientIat = iat;
            clientToken = token;
          }
        }
      } catch {
        // try next
      }
    }
  }
  const hasClientSession = Boolean(clientToken);

  function nextNoStore() {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    return res;
  }

  // 1.5. Guard Admin and Portal API Routes
  if (pathname.startsWith("/api/v1/admin")) {
    if (!hasAdminSession) {
      console.warn(`[proxy] 401 Unauthorized for ${req.method} ${pathname}: No admin session found. Available cookies:`, [...req.cookies.getAll().map((c) => c.name)].join(", "));
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = adminToken.role || "support";
    const isOwnerOrSuper = adminRole === "owner" || adminRole === "superadmin";

    // Staff / Team Management API is restricted to Owner & SuperAdmin
    if (pathname.startsWith("/api/v1/admin/team")) {
      if (!isOwnerOrSuper) {
        return NextResponse.json({ error: "Forbidden: Owner or SuperAdmin privilege required" }, { status: 403 });
      }
    }

    // Commercial APIs blocked for Ops and Support (write operations)
    if (
      (pathname.startsWith("/api/v1/admin/invoices") ||
        pathname.startsWith("/api/v1/admin/contracts") ||
        pathname.startsWith("/api/v1/admin/payments")) &&
      (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE")
    ) {
      if (adminRole === "ops" || adminRole === "support") {
        return NextResponse.json({ error: "Forbidden: Commercial permissions required" }, { status: 403 });
      }
    }

    // Infrastructure APIs blocked for Finance
    if (
      pathname.startsWith("/api/v1/admin/servers") ||
      pathname.startsWith("/api/v1/admin/vault") ||
      pathname.startsWith("/api/v1/admin/releases")
    ) {
      if (adminRole === "finance") {
        return NextResponse.json({ error: "Forbidden: Infrastructure permissions required" }, { status: 403 });
      }
    }

    return nextNoStore();
  }

  if (pathname.startsWith("/api/v1/portal")) {
    const authHeader =
      req.headers.get("authorization") ||
      req.headers.get("x-api-key") ||
      req.headers.get("x-publishable-key") ||
      req.nextUrl.searchParams.get("apiKey") ||
      req.nextUrl.searchParams.get("api_key") ||
      req.nextUrl.searchParams.get("key") ||
      req.nextUrl.searchParams.get("token") ||
      "";
    const hasApiKeyHeader =
      authHeader.startsWith("rsk_") ||
      authHeader.startsWith("rpk_") ||
      authHeader.toLowerCase().startsWith("bearer rsk_") ||
      authHeader.toLowerCase().startsWith("bearer rpk_");

    if (!hasClientSession && !hasAdminSession && !hasApiKeyHeader) {
      console.warn(`[proxy] 401 Unauthorized for ${req.method} ${pathname}: No client/admin session or API key found.`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return nextNoStore();
  }

  // 2. Admin Routes Guard
  if (pathname.startsWith("/admin")) {
    const isLogin = pathname === "/admin/login";

    if (!hasAdminSession) {
      if (isLogin) return nextNoStore();
      url.pathname = "/admin/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    if (isLogin || pathname === "/admin/dashboard") {
      url.pathname = "/admin";
      url.searchParams.delete("callbackUrl");
      return NextResponse.redirect(url);
    }

    // Role-based route segregation for Admin pages
    const role = adminToken.role || "support";
    const isOwnerOrSuper = role === "owner" || role === "superadmin";

    // Team / Staff Management page: strictly Owner and SuperAdmin
    if (pathname.startsWith("/admin/team")) {
      if (!isOwnerOrSuper) {
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
    }

    // Settings page: Owner, SuperAdmin, and Finance (read)
    if (pathname.startsWith("/admin/settings")) {
      if (role === "support" || role === "ops") {
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
    }

    // Commercial sections (Contracts, Invoices, Payments): blocked for Ops and Support
    if (
      pathname.startsWith("/admin/invoices") ||
      pathname.startsWith("/admin/contracts") ||
      pathname.startsWith("/admin/payments")
    ) {
      if (role === "ops" || role === "support") {
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
    }

    // Infrastructure sections (Fleet, Vault, Releases, Embeds): blocked for Finance
    if (
      pathname.startsWith("/admin/servers") ||
      pathname.startsWith("/admin/vault") ||
      pathname.startsWith("/admin/releases") ||
      pathname.startsWith("/admin/embeds")
    ) {
      if (role === "finance") {
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
    }

    return nextNoStore();
  }

  // 3. Client Portal Routes Guard
  if (pathname.startsWith("/portal")) {
    const isLogin = pathname === "/portal/login";

    if (!hasClientSession) {
      if (isLogin) return nextNoStore();
      url.pathname = "/portal/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    if (isLogin || pathname === "/portal/overview") {
      url.pathname = "/portal";
      url.searchParams.delete("callbackUrl");
      return NextResponse.redirect(url);
    }

    return nextNoStore();
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}
