import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import {
  PortalApiKeysView,
  type PortalApiKeyItem,
  type LiveGateInfo,
} from "@/features/portal/portal-api-keys-view";

export const dynamic = "force-dynamic";

export default async function PortalApiKeysPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) {
    redirect("/portal/login");
  }

  const container = getContainer();

  // Server-side data fetching before rendering
  let clientName = "Client Organization";
  let liveGate: LiveGateInfo = {
    status: "Active",
    allowed: true,
    rapidshiftStatus: "online",
    reason: "All dues cleared",
    ttlSeconds: 10,
  };
  let initialKeys: PortalApiKeyItem[] = [];

  try {
    const [client, entitlement, keys] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId),
      container.entitlementModule.evaluate(clientId),
      container.apiKeyRepo.findByClientId(clientId, { includeRevoked: true }),
    ]);

    if (client) {
      clientName = client.name;
    }

    liveGate = {
      status: entitlement.status || "Active",
      allowed: entitlement.allowed !== false,
      rapidshiftStatus: "online",
      reason: entitlement.reason || (entitlement.allowed ? "Dues cleared • Active subscription" : "Dues pending"),
      ttlSeconds: 10,
      overrideMode: entitlement.manualOverrideMode || undefined,
    };

    initialKeys = keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      type: k.type,
      scopes: [...k.scopes],
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt,
    }));
  } catch (err) {
    console.error("[PortalApiKeysPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8">
      <PortalApiKeysView
        clientId={clientId}
        clientName={clientName}
        initialGate={liveGate}
        initialKeys={initialKeys}
      />
    </main>
  );
}
