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
        const [contacts, projects, users, contractsRes] = await Promise.all([
          container.clientDirectoryRepo.findContactsByClient(client.id),
          container.clientDirectoryRepo.findProjectsByClient(client.id),
          container.clientRepo.findByClientId(client.id),
          container.contractRepo.list({ clientId: client.id, limit: 25 }).catch(() => ({ items: [], total: 0 })),
        ]);
        const sortedContracts = [...contractsRes.items].sort((a, b) => {
          const prio = (s: string) => (s === "active" ? 4 : s === "renewed" ? 3 : s === "draft" ? 2 : 1);
          const diff = prio(b.status) - prio(a.status);
          return diff !== 0 ? diff : b.validTo - a.validTo;
        });
        const primaryContract = sortedContracts[0];
        return {
          ...client.toJSON(),
          contactsCount: contacts.length,
          projectsCount: projects.length,
          contractsCount: contractsRes.total,
          activeContract: primaryContract
            ? {
                id: primaryContract.id,
                code: primaryContract.code,
                title: primaryContract.title,
                status: primaryContract.status,
                amountMinor: primaryContract.amountMinor,
                currency: primaryContract.currency,
                billingCycle: primaryContract.billingCycle,
                validFrom: primaryContract.validFrom,
                validTo: primaryContract.validTo,
                anchorDay: primaryContract.anchorDay,
                taxProfile: primaryContract.taxProfile,
              }
            : undefined,
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

    let createdContract = null;
    if (body.createInitialContract && body.contract) {
      const cInput = body.contract;
      const isOneTime =
        Boolean(cInput.isOneTime) ||
        cInput.billingCycle === "one_time" ||
        cInput.billingCycle === "milestone";
      const billingCycle = isOneTime
        ? "one_time"
        : cInput.billingCycle === "annual"
          ? "yearly"
          : cInput.billingCycle || "monthly";
      const validFromMs = cInput.validFrom ? new Date(cInput.validFrom).getTime() : Date.now();
      const rawValidToMs = cInput.validTo ? new Date(cInput.validTo).getTime() : validFromMs + 86_400_000;
      const validToMs =
        isOneTime && (!rawValidToMs || rawValidToMs <= validFromMs)
          ? validFromMs + 86_400_000
          : rawValidToMs;

      let contract = await container.contractsModule.createContractUseCase.execute({
        clientId: client.id,
        title: cInput.title || (isOneTime ? `${client.name} — One-Time Engagement` : `${client.name} — Master Service Agreement`),
        amountMinor: Number(cInput.amountMinor || 0),
        currency: body.currency || "INR",
        billingCycle,
        intervalCount: Number(cInput.intervalCount || 1),
        anchorDay: Number(cInput.anchorDay || new Date(validFromMs).getDate() || 1),
        validFrom: validFromMs,
        validTo: validToMs,
        autoRenew: isOneTime ? false : Boolean(cInput.autoRenew),
        taxProfile: body.billingMode === "gst" ? "gst" : "non_gst",
        notes: cInput.notes,
      });

      try {
        contract = await container.contractsModule.activateContractUseCase.execute(contract.id);
        await container.billingModule.generateScheduleUseCase.execute({
          contractId: contract.id,
          clientId: contract.clientId,
          amountMinor: contract.amountMinor,
          currency: contract.currency,
          billingCycle: contract.billingCycle,
          intervalCount: contract.intervalCount,
          anchorDay: contract.anchorDay,
          validFrom: contract.validFrom,
          validTo: contract.validTo,
          paymentTermsDays: contract.paymentTermsDays,
        });
      } catch (actErr) {
        console.warn("[API] Initial contract auto-activation warning:", actErr);
      }
      createdContract = contract.toJSON();
    }

    return NextResponse.json(
      { client: client.toJSON(), portalUser: createdPortalUser, contract: createdContract },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API] Error creating client:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
