export const dynamic = "force-dynamic";

import { getContainer } from "@rsl/core/container";
import { ServerManager, type SerializedServer, type ClientOption } from "@/features/fleet/server-manager";

export default async function AdminServersPage() {
  const container = getContainer();

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

  return <ServerManager initialServers={initialServers} clients={clientOptions} />;
}
