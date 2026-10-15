export const runtime = "nodejs";

import { getContainer } from "@rsl/core/container";

export async function GET(): Promise<Response> {
  try {
    const container = getContainer();
    const jwks = await container.tokenSigner.getPublicJwks();
    return Response.json(jwks, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[JWKS Error]:", error);
    return Response.json(
      {
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Failed to load public JWKS",
        },
      },
      { status: 500 },
    );
  }
}
