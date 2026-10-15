export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";
import {
  AdminSupportView,
  type SerializedTicket,
  type ClientOption,
  type CannedReplyOption,
} from "@/features/support/admin-support-view";

export default async function AdminSupportPage() {
  const session = await auth();
  const userEmail = session?.user?.email || "admin@rapidshiftlabs.com";
  const userRole = session?.user?.role || "owner";

  const adminActor: Actor = {
    kind: "admin",
    id: (session?.user as any)?.id || "adm_sys",
    email: userEmail,
    name: session?.user?.name || "Admin",
    role: (userRole as any) || "owner",
    supportLevel: (session?.user as any)?.supportLevel ?? 3,
  };

  const container = getContainer();

  let initialTickets: SerializedTicket[] = [];
  let clients: ClientOption[] = [];
  let cannedReplies: CannedReplyOption[] = [];

  try {
    const [ticketsRes, clientsRes, cannedRes] = await Promise.all([
      container.supportModule.listTicketsUseCase
        .execute({ limit: 100 }, adminActor)
        .catch(() => ({ tickets: [], total: 0 })),
      container.clientDirectoryRepo.list({ limit: 100 }),
      container.supportModule.manageCannedRepliesUseCase.list().catch(() => []),
    ]);

    clients = clientsRes.items.map((c) => ({ id: c.id, name: c.name }));

    cannedReplies = cannedRes.map((r: any) => {
      const state = typeof r.toState === "function" ? r.toState() : r;
      return {
        id: state.id,
        title: state.title,
        category: state.category,
        content: state.content,
      };
    });

    initialTickets = await Promise.all(
      ticketsRes.tickets.map(async (rawT: any) => {
        const state = typeof rawT.toState === "function" ? rawT.toState() : rawT.props || rawT;
        const client = await container.clientDirectoryRepo.findById(state.clientId).catch(() => null);
        return {
          id: state.id,
          number: state.number,
          clientId: state.clientId,
          clientName: client?.name || state.clientId,
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
      })
    );
  } catch (err) {
    console.error("[AdminSupportPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <AdminSupportView
        initialTickets={initialTickets}
        clients={clients}
        cannedReplies={cannedReplies}
      />
    </main>
  );
}
