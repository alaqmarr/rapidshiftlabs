export const dynamic = "force-dynamic";

import { getContainer } from "@rsl/core/container";
import {
  ServerManager,
  type SerializedServer,
  type ClientOption,
  type ServerWorkspaceTab,
} from "@/features/fleet/server-manager";

const VALID_TABS = new Set<ServerWorkspaceTab>(["pm2", "nginx", "terminal", "files", "packages"]);

export default async function AdminServersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const container = getContainer();
  const resolvedParams = searchParams ? await searchParams : {};
  const rawTab = typeof resolvedParams.tab === "string" ? resolvedParams.tab : undefined;
  const initialTab: ServerWorkspaceTab =
    rawTab && VALID_TABS.has(rawTab as ServerWorkspaceTab)
      ? (rawTab as ServerWorkspaceTab)
      : "pm2";
  const initialServerId =
    typeof resolvedParams.serverId === "string" ? resolvedParams.serverId : undefined;

  let initialServers: SerializedServer[] = [];
  let clientOptions: ClientOption[] = [];

  try {
    const [serversList, clientsRes] = await Promise.all([
      container.fleetModule.listServers(),
      container.clientDirectoryRepo.list({ limit: 100 }),
    ]);

    clientOptions = clientsRes.items.map((c) => ({
      id: c.id,
      name: c.name,
    }));

    initialServers = await Promise.all(
      serversList.map(async (s) => {
        const processes = await container.pm2ProcessRepo.listByServerId(s.id);
        return {
          id: s.id,
          name: s.name,
          host: s.host,
          port: s.port,
          username: s.username,
          hostFingerprint: s.hostFingerprint,
          status: s.status as any,
          lastCheckedAt: s.lastCheckedAt ? new Date(s.lastCheckedAt).getTime() : null,
          errorMessage: s.errorMessage,
          createdAt: new Date(s.createdAt).getTime(),
          processes: processes.map((p) => ({
            id: p.id,
            serverId: p.serverId,
            pm2Id: p.pm2Id,
            name: p.name,
            clientId: p.clientId,
            allowClientRestart: p.allowClientRestart,
            restartCooldownSec: p.restartCooldownSec,
            status: p.status,
            cpu: p.cpu,
            memory: p.memory,
            restarts: p.restarts,
            uptimeMs: p.uptimeMs,
            lastDiscoveredAt: p.lastDiscoveredAt.getTime(),
          })),
        };
      }),
    );
  } catch (err) {
    console.error("[AdminServersPage] Server fetch error:", err);
  }

  return (
    <ServerManager
      initialServers={initialServers}
      clients={clientOptions}
      initialTab={initialTab}
      initialServerId={initialServerId}
    />
  );
}
