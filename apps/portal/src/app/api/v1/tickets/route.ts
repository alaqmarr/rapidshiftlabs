import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import { renderTicketCreatedEmail } from "@rsl/core/settings";
import { getRequestActor } from "@/lib/auth-actor";
import { calculateContractTenure, pickPrimaryClientContract } from "@/lib/contract-tenure";

export const dynamic = "force-dynamic";

const CRITICAL_INCIDENT_REGEX =
  /\b(502|503|504|500|down|outage|crash|crashing|unresponsive|ssl expired|certificate expired|payment failed|checkout broken|production broken|urgent|emergency)\b/i;

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

export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const container = getContainer();

    const targetClientId =
      body.clientId || (actor.kind === "client_user" ? actor.clientId : undefined);

    // Gather live telemetry for Smart Auto-Triage & System Snapshot
    let clientProcesses: any[] = [];
    let clientDomains: any[] = [];
    let clientContracts: any[] = [];
    if (targetClientId) {
      const [procs, doms, contractsRes] = await Promise.all([
        container.pm2ProcessRepo.listByClientId(targetClientId).catch(() => []),
        container.monitoredDomainRepo.findByClientId(targetClientId).catch(() => []),
        container.contractRepo.list({ clientId: targetClientId, limit: 5 }).catch(() => ({ items: [] })),
      ]);
      clientProcesses = procs || [];
      clientDomains = doms || [];
      clientContracts = contractsRes.items || [];
    }

    const erroredProcs = clientProcesses.filter(
      (p: any) =>
        p.status === "errored" ||
        p.status === "stopped" ||
        (p.status === "online" && p.uptimeMs > 0 && p.uptimeMs < 30_000 && (p.restarts || 0) >= 8),
    );
    const downDomains = clientDomains.filter(
      (d: any) => d.status === "down" || d.status === "degraded",
    );
    const combinedText = `${body.subject || ""} ${body.message || body.body || ""}`;
    const hasCriticalKeywords = CRITICAL_INCIDENT_REGEX.test(combinedText);

    let effectivePriority = body.priority || "P3";
    let autoTriageNote: string | null = null;

    if (effectivePriority === "P3" || effectivePriority === "P4") {
      if ((erroredProcs.length > 0 || downDomains.length > 0) && hasCriticalKeywords) {
        effectivePriority = "P1";
        autoTriageNote = `Auto-Promoted to P1 Urgent (Live infra incident confirmed + critical keyword match)`;
      } else if (erroredProcs.length > 0 || downDomains.length > 0) {
        effectivePriority = "P2";
        autoTriageNote = `Auto-Promoted to P2 High (Active infrastructure alert detected for tenant)`;
      } else if (hasCriticalKeywords) {
        effectivePriority = "P2";
        autoTriageNote = `Auto-Promoted to P2 High (Critical outage signature detected in ticket text)`;
      }
    }

    const { ticket, message } = await container.support.createTicketUseCase.execute(
      {
        ...body,
        clientId: targetClientId || body.clientId,
        priority: effectivePriority,
      },
      actor,
    );

    const ticketState = ticket.toState();

    // Attach Automated Live System Telemetry Snapshot to Ticket Thread
    try {
      const onlineCount = clientProcesses.filter((p: any) => p.status === "online").length;
      const upDomCount = clientDomains.filter((d: any) => d.status === "up").length;
      const primaryContract = pickPrimaryClientContract(clientContracts);
      const tenure = primaryContract
        ? calculateContractTenure({
            billingCycle: primaryContract.billingCycle,
            intervalCount: primaryContract.intervalCount,
            anchorDay: primaryContract.anchorDay,
            validFrom: primaryContract.validFrom,
            validTo: primaryContract.validTo,
            amountMinor: primaryContract.amountMinor,
            status: primaryContract.status,
          })
        : null;

      const procSummary =
        clientProcesses.length > 0
          ? clientProcesses
              .slice(0, 4)
              .map(
                (p: any) =>
                  `${p.name}: ${(p.status || "online").toUpperCase()} (${Math.round((p.memory || 0) / (1024 * 1024))}MB, ${p.restarts || 0} deploys/restarts)`,
              )
              .join(" | ")
          : "No mapped PM2 processes";

      const domSummary =
        clientDomains.length > 0
          ? clientDomains
              .slice(0, 4)
              .map(
                (d: any) =>
                  `${d.hostname}: ${(d.status || "up").toUpperCase()} (SSL: ${d.sslExpiryDays ?? "—"}d)`,
              )
              .join(" | ")
          : "No monitored domains";

      const contractSummary = tenure
        ? `${primaryContract.code || "Active"} • ${tenure.tenureLabel} (${tenure.dateRangeLabel})`
        : "No active contract on file";

      const snapshotLines = [
        `[SYSTEM TELEMETRY SNAPSHOT]`,
        `• Smart Triage: ${autoTriageNote || `Assigned ${ticketState.priority} (${ticketState.level} SLA Queue)`}`,
        `• Fleet (PM2): ${onlineCount}/${clientProcesses.length} Online — ${procSummary}`,
        `• Domains & SSL: ${upDomCount}/${clientDomains.length} Healthy — ${domSummary}`,
        `• Contract & Tenure: ${contractSummary}`,
      ];

      await container.support.addTicketMessageUseCase.execute(
        {
          ticketId: ticket.id,
          body: snapshotLines.join("\n"),
          isInternal: false,
        },
        SYSTEM_ACTOR("smart-support-triage"),
      );
    } catch (snapErr) {
      console.warn("[TicketsAPI] Warning: Failed to attach telemetry snapshot:", snapErr);
    }

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

        const client = await container.clientDirectoryRepo.findById(ticketState.clientId);
        const clientName = client?.name || "Client";
        const contacts = await container.clientDirectoryRepo.findContactsByClient(ticketState.clientId);
        const primaryContact = contacts.find((c: any) => c.isPrimary) || contacts[0];

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
        autoTriaged: Boolean(autoTriageNote),
        autoTriageNote,
        ticket: ticketState,
        message: message.props,
        data: {
          ticket: ticketState,
          message: message.props,
          autoTriaged: Boolean(autoTriageNote),
          autoTriageNote,
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
