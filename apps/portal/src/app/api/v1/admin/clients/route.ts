export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;

    const container = getContainer();
    const result = await container.clientsModule.listClientsUseCase.execute({
      search,
      status,
      limit: 100,
    });

    const itemsWithDetails = await Promise.all(
      result.items.map(async (client) => {
        const [contacts, projects, users] = await Promise.all([
          container.clientDirectoryRepo.findContactsByClient(client.id),
          container.clientDirectoryRepo.findProjectsByClient(client.id),
          container.clientRepo.findByClientId(client.id),
        ]);
        return {
          ...client.toJSON(),
          contactsCount: contacts.length,
          projectsCount: projects.length,
          contacts: contacts.map((c) => c.toJSON()),
          projects: projects.map((p) => p.toJSON()),
          portalUsers: users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email.value,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt.getTime(),
          })),
        };
      }),
    );

    return NextResponse.json({ items: itemsWithDetails, total: result.total });
  } catch (error) {
    console.error("[API] Error listing clients:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const container = getContainer();

    const client = await container.clientsModule.createClientUseCase.execute({
      name: body.name,
      slug: body.slug,
      gstin: body.gstin,
      pan: body.pan,
      billingMode: body.billingMode,
      currency: body.currency,
      timezone: body.timezone,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      country: body.country,
      notes: body.notes,
    });

    if (body.contactName && body.contactEmail) {
      await container.clientsModule.createContactUseCase.execute({
        clientId: client.id,
        name: body.contactName,
        email: body.contactEmail,
        phone: body.contactPhone,
        isPrimary: true,
      });
    }

    let createdPortalUser = null;
    if (body.createPortalCredentials && body.contactEmail && body.contactName) {
      createdPortalUser = await container.clientsModule.inviteClientUserUseCase.execute({
        clientId: client.id,
        name: body.contactName,
        email: body.contactEmail,
        password: body.portalPassword || undefined,
        role: "client_admin",
      });
    }

    return NextResponse.json({ client: client.toJSON(), portalUser: createdPortalUser }, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating client:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
