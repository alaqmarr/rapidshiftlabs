export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";
import { PortalReleasesView } from "@/features/releases/portal-releases-view";
import type { SerializedRelease } from "@/features/releases/releases-manager";

export default async function PortalReleasesPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) {
    redirect("/portal/login");
  }

  const container = getContainer();
  const userEmail = session?.user?.email || "";
  const clientActor: Actor = {
    kind: "client_user",
    id: (session?.user as any)?.id || "usr_client",
    email: userEmail,
    name: session?.user?.name || "Client User",
    clientId: clientId,
    role: "client_admin",
  };

  let clientName = "Client Organization";
  let releases: SerializedRelease[] = [];
  let initialChangelog: any[] = [];
  let initialRepo: string | undefined;
  let initialBranch: string | undefined;

  try {
    const [client, releasesRes, changelogRes] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId).catch(() => null),
      container.releasesModule.listReleasesUseCase
        .execute({ clientId }, clientActor)
        .catch(() => []),
      container.releasesModule.getClientChangelogUseCase
        .execute({ clientId, filterType: "all", limit: 50 })
        .catch(() => ({ items: [], clientRepo: undefined, clientBranch: undefined })),
    ]);

    if (client) {
      clientName = client.name;
    }

    if (changelogRes) {
      initialChangelog = changelogRes.items || [];
      initialRepo = changelogRes.clientRepo;
      initialBranch = changelogRes.clientBranch;
    }

    releases = releasesRes.map((rawR: any) => {
      const state = typeof rawR.toState === "function" ? rawR.toState() : rawR.props || rawR;
      return {
        id: state.id,
        clientId: state.clientId,
        clientName: clientName,
        title: state.title,
        version: state.version,
        environment: state.environment,
        url: state.url,
        notes: state.notes || null,
        active: !!state.active,
        createdAt: state.createdAt || Date.now(),
        updatedAt: state.updatedAt || Date.now(),
      };
    });
  } catch (err) {
    console.error("[PortalReleasesPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <PortalReleasesView
        clientId={clientId}
        clientName={clientName}
        releases={releases}
        initialChangelog={initialChangelog}
        initialRepo={initialRepo}
        initialBranch={initialBranch}
      />
    </main>
  );
}
