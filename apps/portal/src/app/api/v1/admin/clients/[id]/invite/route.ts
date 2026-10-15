export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const container = getContainer();

    const result = await container.clientsModule.inviteClientUserUseCase.execute({
      clientId: id,
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role || "client_member",
    });

    return NextResponse.json({ user: result }, { status: 201 });
  } catch (error) {
    console.error("[API] Error inviting client user:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
