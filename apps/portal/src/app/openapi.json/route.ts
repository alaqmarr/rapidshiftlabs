import { NextResponse } from "next/server";
import { openApiSpec } from "@rsl/core/openapi";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(openApiSpec, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
