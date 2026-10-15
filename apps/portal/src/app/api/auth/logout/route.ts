import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_COOKIES = [
  "rsl.admin.session-token",
  "__Secure-rsl.admin.session-token",
];

const CLIENT_COOKIES = [
  "rsl.portal.session-token",
  "__Secure-rsl.portal.session-token",
];

const COMMON_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
];

function applyLogoutCookies(response: NextResponse, realm?: string | null) {
  let targetCookies: string[];
  if (realm === "client") {
    targetCookies = [...CLIENT_COOKIES, ...COMMON_COOKIES];
  } else if (realm === "admin") {
    targetCookies = [...ADMIN_COOKIES, ...COMMON_COOKIES];
  } else {
    targetCookies = [...ADMIN_COOKIES, ...CLIENT_COOKIES, ...COMMON_COOKIES];
  }

  for (const name of targetCookies) {
    // Emit both non-Secure and Secure expiration headers via headers.append
    // so NextResponse.cookies Map does not overwrite one with the other.
    if (!name.startsWith("__Secure-") && !name.startsWith("__Host-")) {
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`,
      );
    }
    response.headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
    );
  }
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callbackUrl = searchParams.get("callbackUrl") || "/admin/login";
  const realm = searchParams.get("realm");

  const response = NextResponse.json({ success: true, redirectUrl: callbackUrl });
  applyLogoutCookies(response, realm);
  return response;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callbackUrl = searchParams.get("callbackUrl") || "/admin/login";
  const realm = searchParams.get("realm");

  const redirectUrl = new URL(callbackUrl, req.url);
  const response = NextResponse.redirect(redirectUrl);
  applyLogoutCookies(response, realm);
  return response;
}
