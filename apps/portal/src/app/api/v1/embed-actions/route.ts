export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import type { Actor } from "@rsl/core/kernel";
import { clearGateCache } from "@/lib/cache/lru-cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      token,
      apiKey,
      key,
      widget,
      action,
      clientId: reqClientId,
      payload = {},
    } = body;

    const rawCredential = (apiKey || key || token || "").trim();
    const container = getContainer();
    let resolvedClientId = reqClientId;

    // 1. Verify API key (rsl_live_..., rpk_live_..., or rsk_live_...) if provided in body
    if (
      rawCredential &&
      (rawCredential.startsWith("rsl_") ||
        rawCredential.startsWith("rpk_") ||
        rawCredential.startsWith("rsk_"))
    ) {
      const verifiedKey = await container.apiPlatformModule.validateApiKey(rawCredential);
      if (!verifiedKey || !verifiedKey.valid || !verifiedKey.clientId) {
        return NextResponse.json(
          { error: "Invalid, expired, or revoked API key for embed action" },
          { status: 401 }
        );
      }
      resolvedClientId = verifiedKey.clientId;
    } else if (rawCredential && rawCredential.startsWith("emb_")) {
      // 2. Verify scoped embed token if provided
      try {
        const verified = await container.embeds.verifyEmbedTokenUseCase.execute(
          rawCredential,
          widget || "client-dashboard"
        );
        resolvedClientId = verified.clientId;
      } catch (err: any) {
        return NextResponse.json(
          { error: err?.message || "Invalid or expired embed token" },
          { status: 401 }
        );
      }
    } else {
      // 3. Fallback: check header API key or authenticated user session
      const sessionActor = await getRequestActor(request);
      if (sessionActor?.kind === "client_user" || sessionActor?.kind === "api_key") {
        resolvedClientId = sessionActor.clientId;
      } else if (sessionActor?.kind === "admin") {
        resolvedClientId = reqClientId;
      } else {
        return NextResponse.json(
          { error: "Unauthorized: Valid API key, embed token, or authenticated session required" },
          { status: 401 }
        );
      }
    }

    if (!resolvedClientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const clientActor: Actor = {
      kind: "client_user",
      id: `usr_${resolvedClientId}`,
      email: "client@embed.service",
      name: "Client Embed User",
      clientId: resolvedClientId,
      role: "client_admin",
    };

    switch (action) {
      case "pay-invoice": {
        const { invoiceId, method = "upi", reference, notes } = payload;
        if (!invoiceId) {
          return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
        }

        const invoice = await container.billingRepo.findInvoiceById(invoiceId);
        if (!invoice) {
          return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }
        if (invoice.clientId !== resolvedClientId) {
          return NextResponse.json({ error: "Unauthorized invoice access" }, { status: 403 });
        }

        const txnRef = reference || `TXN-EMB-${Date.now().toString(36).toUpperCase()}`;
        const { payment, invoice: updatedInvoice } =
          await container.billingModule.recordPaymentUseCase.execute({
            invoiceId,
            amountMinor: invoice.balanceMinor,
            method,
            reference: txnRef,
            notes: notes || "Settled in-place via RapidShift Embed",
            recordedBy: "client_embed",
          });

        // Trigger gate recovery
        try {
          await container.entitlementModule.handleBillingEvent("InvoicePaid", {
            clientId: resolvedClientId,
            invoiceId: updatedInvoice.id,
            balancePaise: updatedInvoice.balanceMinor,
          });
          clearGateCache();
        } catch (e) {
          console.warn("[EmbedAction] Entitlement sync warning:", e);
        }

        return NextResponse.json({
          success: true,
          action: "pay-invoice",
          payment: payment.toJSON(),
          invoice: updatedInvoice.toJSON(),
        });
      }

      case "restart-process": {
        let processId = payload?.processId;
        if (!processId && resolvedClientId) {
          const clientProcs = await container.pm2ProcessRepo.listByClientId(resolvedClientId);
          if (clientProcs.length > 0) {
            processId = clientProcs[0].id || (clientProcs[0] as any).props?.id;
          }
        }
        if (!processId) {
          return NextResponse.json({ error: "Missing processId" }, { status: 400 });
        }

        const proc = await container.pm2ProcessRepo.findById(processId);
        if (!proc) {
          return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }
        const procClientId = proc.clientId ?? (proc as any).props?.clientId;
        if (procClientId !== resolvedClientId) {
          return NextResponse.json({ error: "Unauthorized process access" }, { status: 403 });
        }

        const result = await container.fleetModule.restartProcess({
          processId,
          actor: clientActor,
        });

        return NextResponse.json({
          success: true,
          action: "restart-process",
          result,
        });
      }

      case "get-process-logs": {
        let processId = payload?.processId;
        const lines = payload?.lines ?? 60;
        if (!processId && resolvedClientId) {
          const clientProcs = await container.pm2ProcessRepo.listByClientId(resolvedClientId);
          if (clientProcs.length > 0) {
            processId = clientProcs[0].id || (clientProcs[0] as any).props?.id;
          }
        }
        if (!processId) {
          return NextResponse.json({ error: "Missing processId" }, { status: 400 });
        }

        const proc = await container.pm2ProcessRepo.findById(processId);
        if (!proc) {
          return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }
        const procClientId = proc.clientId ?? (proc as any).props?.clientId;
        if (procClientId !== resolvedClientId) {
          return NextResponse.json({ error: "Unauthorized process access" }, { status: 403 });
        }

        const logs = await container.fleetModule.getProcessLogs({
          processId,
          options: { lines: Number(lines) },
          actor: clientActor,
        });

        return NextResponse.json({
          success: true,
          action: "get-process-logs",
          logs,
        });
      }

      case "check-domain": {
        let domainId = payload?.domainId;
        if (!domainId && resolvedClientId) {
          const clientDomains = await container.monitoredDomainRepo.findByClientId(resolvedClientId);
          if (clientDomains.length > 0) {
            domainId = clientDomains[0].id || (clientDomains[0] as any).props?.id;
          }
        }
        if (!domainId) {
          return NextResponse.json({ error: "Missing domainId" }, { status: 400 });
        }

        const domain = await container.monitoringModule.getDomain(domainId);
        if (!domain) {
          return NextResponse.json({ error: "Domain not found" }, { status: 404 });
        }
        const domClientId = (domain as any).clientId ?? (domain as any).props?.clientId;
        if (domClientId !== resolvedClientId) {
          return NextResponse.json({ error: "Unauthorized domain access" }, { status: 403 });
        }

        const [http, ssl, dns] = await Promise.allSettled([
          container.monitoringModule.executeHttpCheck({ domain }),
          container.monitoringModule.executeSslCheck({ domain }),
          container.monitoringModule.executeDnsCheck({ domain }),
        ]);

        const updated = await container.monitoringModule.getDomain(domainId);

        return NextResponse.json({
          success: true,
          action: "check-domain",
          domain: updated && typeof updated.toState === "function" ? updated.toState() : (updated as any)?.props || updated,
          results: {
            http: http.status === "fulfilled" ? http.value : null,
            ssl: ssl.status === "fulfilled" ? ssl.value : null,
            dns: dns.status === "fulfilled" ? dns.value : null,
          },
        });
      }

      case "create-ticket": {
        const { subject, message, priority = "P2", category = "question" } = payload;
        if (!subject || !message) {
          return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
        }

        const validCategory =
          category === "billing" ||
          category === "access" ||
          category === "outage" ||
          category === "change-request" ||
          category === "bug"
            ? category
            : "question";

        const { ticket, message: msg } = await container.support.createTicketUseCase.execute(
          {
            clientId: resolvedClientId,
            subject,
            message,
            priority: (priority as any) || "P2",
            category: validCategory,
            source: "portal",
          },
          clientActor
        );

        return NextResponse.json({
          success: true,
          action: "create-ticket",
          ticket: ticket.toState(),
          message: msg.props,
        });
      }

      case "reply-ticket": {
        const { ticketId, message } = payload;
        if (!ticketId || !message) {
          return NextResponse.json({ error: "Ticket ID and message required" }, { status: 400 });
        }

        const ticket = await container.ticketRepo.findById(ticketId);
        if (!ticket || ticket.clientId !== resolvedClientId) {
          return NextResponse.json({ error: "Ticket not found or unauthorized" }, { status: 404 });
        }

        const addedMsg = await container.support.addTicketMessageUseCase.execute(
          {
            ticketId,
            body: message,
            isInternal: false,
          },
          clientActor
        );

        return NextResponse.json({
          success: true,
          action: "reply-ticket",
          message: addedMsg.props,
        });
      }

      case "reveal-credential": {
        const { credentialId } = payload;
        if (!credentialId) {
          return NextResponse.json({ error: "Missing credentialId" }, { status: 400 });
        }

        const cred = await container.vaultRepo.findById(credentialId);
        if (!cred || cred.props.clientId !== resolvedClientId) {
          return NextResponse.json({ error: "Credential not found or unauthorized" }, { status: 404 });
        }

        const revealed = await container.vault.revealCredentialUseCase.execute(
          credentialId,
          clientActor
        );

        return NextResponse.json({
          success: true,
          action: "reveal-credential",
          revealed,
        });
      }

      case "request-contract-renewal": {
        const { contractCode, requestedTenure, notes } = payload;
        const subject = `[RENEWAL REQUEST] Contract ${contractCode || "Active Engagement"} Tenure Extension`;
        const bodyMsg = `Client requested contract renewal / tenure extension directly via live embed widget.\n• Contract: ${contractCode || "Primary Contract"}\n• Requested Tenure: ${requestedTenure || "Same Tenure Roll-Forward"}\n${notes ? `• Notes: ${notes}` : ""}`;

        const { ticket } = await container.support.createTicketUseCase.execute(
          {
            clientId: resolvedClientId,
            subject,
            message: bodyMsg,
            priority: "P2",
            category: "billing",
            source: "portal",
          },
          clientActor
        );

        return NextResponse.json({
          success: true,
          action: "request-contract-renewal",
          ticket: ticket.toState(),
          message: "Renewal request submitted to commercial desk.",
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[API EmbedActions] Error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
