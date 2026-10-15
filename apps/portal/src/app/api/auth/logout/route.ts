import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAMES = [
  "rsl.admin.session-token",
  "__Secure-rsl.admin.session-token",
  "rsl.portal.session-token",
  "__Secure-rsl.portal.session-token",
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

function applyLogoutCookies(response: NextResponse) {
  for (const name of COOKIE_NAMES) {
    // Standard cookie deletion
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
    });
    // Also explicitly expire with secure: true to cover both HTTPS & HTTP environments
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callbackUrl = searchParams.get("callbackUrl") || "/admin/login";

  const response = NextResponse.json({ success: true, redirectUrl: callbackUrl });
  applyLogoutCookies(response);
  return response;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callbackUrl = searchParams.get("callbackUrl") || "/admin/login";

  const redirectUrl = new URL(callbackUrl, req.url);
  const response = NextResponse.redirect(redirectUrl);
  applyLogoutCookies(response);
  return response;
}
