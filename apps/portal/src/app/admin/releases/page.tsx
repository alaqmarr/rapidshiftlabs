export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import {
  ReleasesManager,
  type SerializedRelease,
  type ClientOption,
} from "@/features/releases/releases-manager";

export default async function AdminReleasesPage() {
  const container = getContainer();

  let initialReleases: SerializedRelease[] = [];
  let clients: ClientOption[] = [];

  try {
    const adminActor = SYSTEM_ACTOR("admin-releases-page");
    const [releasesRes, clientsRes] = await Promise.all([
      container.releasesModule.listReleasesUseCase.execute({}, adminActor).catch(() => []),
      container.clientDirectoryRepo.list({ limit: 100 }),
    ]);

    clients = clientsRes.items.map((c) => ({ id: c.id, name: c.name }));

    initialReleases = await Promise.all(
      releasesRes.map(async (rawR: any) => {
        const state = typeof rawR.toState === "function" ? rawR.toState() : rawR.props || rawR;
        const client = await container.clientDirectoryRepo.findById(state.clientId).catch(() => null);
        return {
          id: state.id,
          clientId: state.clientId,
          clientName: client?.name || state.clientId,
          title: state.title,
          version: state.version,
          environment: state.environment,
          url: state.url,
          notes: state.notes || null,
          active: !!state.active,
          createdAt: state.createdAt || Date.now(),
          updatedAt: state.updatedAt || Date.now(),
        };
      })
    );
  } catch (err) {
    console.error("[AdminReleasesPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <ReleasesManager initialReleases={initialReleases} clients={clients} />
    </main>
  );
}
