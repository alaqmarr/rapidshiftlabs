import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status") as any;
    const priority = searchParams.get("priority") as any;
    const level = searchParams.get("level") as any;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const container = getContainer();
    const result = await container.support.listTicketsUseCase.execute(
      { clientId, status, priority, level, limit, offset },
      actor,
    );

    return NextResponse.json({
      data: result.tickets.map((t) => t.toState()),
      meta: { total: result.total, limit, offset },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list tickets" },
      { status: err?.status || 400 },
    );
  }
}

import { renderTicketCreatedEmail } from "@rsl/core/settings";

export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const container = getContainer();

    const { ticket, message } = await container.support.createTicketUseCase.execute(
      body,
      actor,
    );

    const ticketState = ticket.toState();

    // 1. Publish Realtime SSE Event
    try {
      const eventPayload = {
        id: `evt_${Date.now()}`,
        topic: "tickets",
        type: "ticket.created",
        clientId: ticket.clientId,
        payload: ticketState,
        timestamp: Date.now(),
      };

      container.realtimeHub.publish("tickets", eventPayload);

      if (ticket.clientId) {
        container.realtimeHub.publish(`client:${ticket.clientId}:tickets`, {
          ...eventPayload,
          topic: `client:${ticket.clientId}:tickets`,
        });
      }
    } catch (pubErr) {
      console.error("[TicketsAPI] Warning: Failed to publish ticket.created SSE:", pubErr);
    }

    // 2. Dispatch Email Notifications
    (async () => {
      try {
        const company = await container.settingsRepo.getCompanySettings();
        const emailSettings = await container.settingsRepo.getEmailSettings();
        const portalBaseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

        // Fetch client details
        const client = await container.clientDirectoryRepo.findById(ticketState.clientId);
        const clientName = client?.name || "Client";
        const contacts = await container.clientDirectoryRepo.findContactsByClient(ticketState.clientId);
        const primaryContact = contacts.find((c: any) => c.isPrimary) || contacts[0];

        // 2a. Send confirmation to client
        if (primaryContact && primaryContact.email) {
          const clientTemplate = renderTicketCreatedEmail({
            ticketNumber: ticketState.number,
            ticketSubject: ticketState.subject,
            clientName: primaryContact.name || clientName,
            priority: ticketState.priority,
            category: ticketState.category,
            initialMessage: message.props.body,
            isStaffNotification: false,
            portalUrl: `${portalBaseUrl}/portal/support`,
            firmName: company.legalName || "RapidShift Labs",
          });

          await container.settingsModule.emailSender.send({
            to: primaryContact.email,
            subject: clientTemplate.subject,
            html: clientTemplate.html,
            text: clientTemplate.text,
          });
          console.log(`[Ticket Created Email] Confirmation sent to client ${primaryContact.email}`);
        }

        // 2b. Send alert to staff
        const staffEmail = emailSettings.fromEmail || emailSettings.user;
        if (staffEmail) {
          const staffTemplate = renderTicketCreatedEmail({
            ticketNumber: ticketState.number,
            ticketSubject: ticketState.subject,
            clientName: clientName,
            priority: ticketState.priority,
            category: ticketState.category,
            initialMessage: message.props.body,
            isStaffNotification: true,
            portalUrl: `${portalBaseUrl}/admin/support`,
            firmName: company.legalName || "RapidShift Labs",
          });

          await container.settingsModule.emailSender.send({
            to: staffEmail,
            subject: staffTemplate.subject,
            html: staffTemplate.html,
            text: staffTemplate.text,
          });
          console.log(`[Ticket Created Email] Alert sent to staff ${staffEmail}`);
        }
      } catch (mailErr) {
        console.error("[Ticket Created Email] Warning: Email dispatch failed:", mailErr);
      }
    })();

    return NextResponse.json(
      {
        ...ticketState,
        ticket: ticketState,
        message: message.props,
        data: {
          ticket: ticketState,
          message: message.props,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create ticket" },
      { status: err?.status || 400 },
    );
  }
}

