export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { WIDGET_CATALOG, type WidgetDefinition } from "@rsl/core/embeds";
import { PortalEmbedsView } from "@/features/embeds/portal-embeds-view";
import type { WidgetCatalogItem } from "@/features/embeds/embed-studio";

export default async function PortalEmbedsPage() {
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

  let clientName = "Client Organization";
  try {
    const client = await container.clientDirectoryRepo.findById(clientId).catch(() => null);
    if (client) {
      clientName = client.name;
    }
  } catch (err) {
    console.error("[PortalEmbedsPage] Server fetch error:", err);
  }

  const widgets: WidgetCatalogItem[] = Object.values(WIDGET_CATALOG).map((w: WidgetDefinition) => ({
    name: w.name,
    tag: w.tag,
    title: w.title,
    description: w.description,
    sensitive: w.sensitive,
    requiredScopes: w.requiredScopes as string[],
  }));

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <PortalEmbedsView
        clientId={clientId}
        clientName={clientName}
        widgets={widgets}
      />
    </main>
  );
}
