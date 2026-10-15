export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { PortalFleetView, type PortalProcess } from "@/features/fleet/portal-fleet-view";

export default async function PortalInfrastructurePage() {
  const session = await auth();
  const container = getContainer();

  let clientId = session?.user?.clientId;
  if (!clientId) {
    try {
      const allClients = await container.clientDirectoryRepo.list({ limit: 1 });
      clientId = allClients.items[0]?.id || "cli_preview_01";
    } catch {
      clientId = "cli_preview_01";
    }
  }

  let processes: PortalProcess[] = [];

  try {
    const [rawProcesses, serversList] = await Promise.all([
      container.pm2ProcessRepo.listByClientId(clientId),
      container.fleetModule.listServers(),
    ]);

    const serverMap = new Map(serversList.map((s) => [s.id, s.name]));

    processes = rawProcesses.map((p) => ({
      id: p.id,
      serverId: p.serverId,
      serverName: serverMap.get(p.serverId) || "Remote Server",
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
    }));
  } catch (err) {
    console.error("[PortalInfrastructurePage] Server fetch error:", err);
  }

  return <PortalFleetView clientId={clientId} processes={processes} />;
}
