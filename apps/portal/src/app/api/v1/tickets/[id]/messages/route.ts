import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { isStaff } from "@rsl/core/kernel";
import { renderTicketReplyEmail } from "@rsl/core/settings";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const container = getContainer();

    const ticket = await container.ticketRepo.findById(id);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!isStaff(actor) && actor.kind === "client_user" && ticket.clientId !== actor.clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const includeInternal = isStaff(actor);
    const messages = await container.ticketRepo.listMessages(id, includeInternal);

    const mapped = messages.map((m) => {
      const p = m.props;
      const isStaffAuthor = p.authorType === "admin" || p.authorType === "system";
      return {
        ...p,
        senderId: p.authorId,
        senderName: p.authorName,
        senderType: (isStaffAuthor
          ? p.authorType === "system"
            ? "system"
            : "staff"
          : "client") as "client" | "staff" | "system",
      };
    });

    return NextResponse.json({
      data: mapped,
      items: mapped,
      messages: mapped,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list ticket messages" },
      { status: err?.status || 400 },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const container = getContainer();

    const message = await container.support.addTicketMessageUseCase.execute(
      {
        ticketId: id,
        body: body.body,
        isInternal: Boolean(body.isInternal),
      },
      actor,
    );

    const p = message.props;
    const isStaffAuthor = p.authorType === "admin" || p.authorType === "system";
    const normalized = {
      ...p,
      senderId: p.authorId,
      senderName: p.authorName,
      senderType: (isStaffAuthor
        ? p.authorType === "system"
          ? "system"
          : "staff"
        : "client") as "client" | "staff" | "system",
    };

    // 1. Publish Realtime SSE Event
    try {
      const ticket = await container.ticketRepo.findById(id);
      const clientId = ticket?.clientId;

      const eventPayload = {
        id: normalized.id,
        topic: "tickets",
        type: "ticket.message_added",
        clientId,
        payload: normalized,
        timestamp: Date.now(),
      };

      container.realtimeHub.publish("tickets", eventPayload);

      if (clientId) {
        container.realtimeHub.publish(`client:${clientId}:tickets`, {
          ...eventPayload,
          topic: `client:${clientId}:tickets`,
        });
      }
    } catch (e) {
      console.error("[TicketMessagesAPI] Warning: Failed to publish SSE message:", e);
    }

    // 2. Dispatch Email Notification (if not internal note)
    if (!p.isInternal) {
      (async () => {
        try {
          const ticket = await container.ticketRepo.findById(id);
          if (!ticket) return;

          const ticketState = ticket.toState();
          const company = await container.settingsRepo.getCompanySettings();
          const emailSettings = await container.settingsRepo.getEmailSettings();
          const portalBaseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

          if (isStaff(actor)) {
            // Staff replied: Notify client primary contact
            const contacts = await container.clientDirectoryRepo.findContactsByClient(ticketState.clientId);
            const recipient = contacts.find((c: any) => c.isPrimary) || contacts[0];
            if (recipient && recipient.email) {
              const rendered = renderTicketReplyEmail({
                ticketNumber: ticketState.number,
                ticketSubject: ticketState.subject,
                clientName: recipient.name || "Valued Client",
                authorName: p.authorName || "RapidShift Support",
                isStaffReply: true,
                messageBody: p.body,
                portalUrl: `${portalBaseUrl}/portal/support`,
                firmName: company.legalName || "RapidShift Labs",
              });

              await container.settingsModule.emailSender.send({
                to: recipient.email,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
              });
              console.log(`[Ticket Reply Email] Sent update to client contact ${recipient.email}`);
            }
          } else {
            // Client replied: Notify operations / staff
            const staffEmail = emailSettings.fromEmail || emailSettings.user;
            if (staffEmail) {
              const rendered = renderTicketReplyEmail({
                ticketNumber: ticketState.number,
                ticketSubject: ticketState.subject,
                clientName: ticketState.clientId,
                authorName: p.authorName || "Client User",
                isStaffReply: false,
                messageBody: p.body,
                portalUrl: `${portalBaseUrl}/admin/support`,
                firmName: company.legalName || "RapidShift Labs",
              });

              await container.settingsModule.emailSender.send({
                to: staffEmail,
                subject: `[STAFF ALERT] ${rendered.subject}`,
                html: rendered.html,
                text: rendered.text,
              });
              console.log(`[Ticket Reply Email] Sent alert to staff ${staffEmail}`);
            }
          }
        } catch (mailErr) {
          console.error("[Ticket Reply Email] Warning: Email dispatch failed:", mailErr);
        }
      })();
    }

    return NextResponse.json({ data: normalized, ...normalized }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to add ticket message" },
      { status: err?.status || 400 },
    );
  }
}

