export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";
import {
  PortalSupportView,
  type IncidentItem,
} from "@/features/support/portal-support-view";
import type { SerializedTicket } from "@/features/support/admin-support-view";

export default async function PortalSupportPage() {
  const session = await auth();
  const container = getContainer();

  const userEmail = session?.user?.email || "client@company.com";
  const userRole = session?.user?.role || "client_member";

  let clientId = session?.user?.clientId;
  if (!clientId) {
    try {
      const allClients = await container.clientDirectoryRepo.list({ limit: 1 });
      clientId = allClients.items[0]?.id || "cli_preview_01";
    } catch {
      clientId = "cli_preview_01";
    }
  }

  const clientActor: Actor = {
    kind: "client_user",
    id: (session?.user as any)?.id || "usr_client",
    email: userEmail,
    name: session?.user?.name || "Client User",
    clientId: clientId,
    role: "client_admin",
  };

  let clientName = "Client Organization";
  let incidents: IncidentItem[] = [];
  let initialTickets: SerializedTicket[] = [];

  try {
    const [client, activeIncidents, ticketsRes] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId).catch(() => null),
      container.monitoringModule.listActiveIncidents(clientId).catch(() => []),
      container.supportModule.listTicketsUseCase
        .execute({ clientId }, clientActor)
        .catch(() => ({ tickets: [], total: 0 })),
    ]);

    if (client) {
      clientName = client.name;
    }

    incidents = activeIncidents.map((inc) => {
      const state = inc.toState();
      return {
        id: state.id,
        type: state.type,
        status: state.status,
        startedAt: state.startedAt,
        summary: state.title || state.reason || "Active incident logged by automated monitor",
      };
    });

    initialTickets = ticketsRes.tickets.map((rawT: any) => {
      const state = typeof rawT.toState === "function" ? rawT.toState() : rawT.props || rawT;
      return {
        id: state.id,
        number: state.number,
        clientId: state.clientId,
        clientName: clientName,
        projectId: state.projectId ?? null,
        category: state.category ?? "question",
        subject: state.subject ?? "Support Ticket",
        priority: state.priority ?? "P3",
        level: state.level ?? "L1",
        status: state.status ?? "open",
        assigneeName: state.assigneeName ?? null,
        source: state.source ?? "portal",
        firstResponseDueAt: state.firstResponseDueAt ?? Date.now(),
        firstRespondedAt: state.firstRespondedAt ?? null,
        resolutionDueAt: state.resolutionDueAt ?? Date.now(),
        resolvedAt: state.resolvedAt ?? null,
        slaBreached: !!state.slaBreached,
        csatRating: state.csatRating ?? null,
        createdAt: state.createdAt ?? Date.now(),
        updatedAt: state.updatedAt ?? Date.now(),
      };
    });
  } catch (err) {
    console.error("[PortalSupportPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <PortalSupportView
        clientId={clientId}
        clientName={clientName}
        userEmail={userEmail}
        userRole={userRole}
        initialTickets={initialTickets}
        incidents={incidents}
      />
    </main>
  );
}
