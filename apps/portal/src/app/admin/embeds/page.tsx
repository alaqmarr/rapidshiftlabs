export const dynamic = "force-dynamic";

import { getContainer } from "@rsl/core/container";
import { EmbedStudioView, type ClientOption } from "@/features/embeds/embed-studio-view";

export default async function AdminEmbedsPage() {
  const container = getContainer();
  let clients: ClientOption[] = [];

  try {
    const clientsRes = await container.clientDirectoryRepo.list({ limit: 100 });
    clients = clientsRes.items.map((c) => ({ id: c.id, name: c.name }));
  } catch (err) {
    console.error("[AdminEmbedsPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <EmbedStudioView clients={clients} />
    </main>
  );
}
