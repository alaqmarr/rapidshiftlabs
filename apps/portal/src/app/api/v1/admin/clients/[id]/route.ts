export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const container = getContainer();
    const details = await container.clientsModule.getClientUseCase.execute(id);
    if (!details || !details.client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      client: {
        ...details.client.toJSON(),
        contactsCount: details.contacts.length,
        projectsCount: details.projects.length,
        contacts: details.contacts.map((c) => c.toJSON()),
        projects: details.projects.map((p) => p.toJSON()),
      },
    });
  } catch (error) {
    console.error("[API] Error fetching client:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const container = getContainer();

    const updated = await container.clientsModule.updateClientUseCase.execute(id, {
      name: body.name,
      slug: body.slug,
      gstin: body.gstin,
      pan: body.pan,
      billingMode: body.billingMode,
      currency: body.currency,
      timezone: body.timezone,
      status: body.status,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      country: body.country,
      notes: body.notes,
      githubRepo: body.githubRepo,
      githubBranch: body.githubBranch,
    });

    return NextResponse.json({ client: updated.toJSON() });
  } catch (error) {
    console.error("[API] Error updating client:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
