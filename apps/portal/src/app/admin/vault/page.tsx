export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import {
  AdminVaultView,
  type SerializedVaultCredential,
  type ClientOption,
} from "@/features/vault/admin-vault-view";

export default async function AdminVaultPage() {
  const container = getContainer();

  let initialCredentials: SerializedVaultCredential[] = [];
  let clients: ClientOption[] = [];

  try {
    const adminActor = SYSTEM_ACTOR("admin-vault-page");
    const [credsRes, clientsRes] = await Promise.all([
      container.vault.listCredentialsUseCase.execute({}, adminActor).catch(() => []),
      container.clientDirectoryRepo.list({ limit: 100 }),
    ]);

    clients = clientsRes.items.map((c) => ({ id: c.id, name: c.name }));

    initialCredentials = await Promise.all(
      credsRes.map(async (rawC: any) => {
        const state = typeof rawC.toState === "function" ? rawC.toState() : rawC.props || rawC;
        const client = await container.clientDirectoryRepo.findById(state.clientId).catch(() => null);
        return {
          id: state.id,
          clientId: state.clientId,
          clientName: client?.name || state.clientId,
          name: state.name,
          category: state.category,
          username: state.username || null,
          oneTimeReveal: !!state.oneTimeReveal,
          revealedCount: state.revealedCount || 0,
          lastRevealedAt: state.lastRevealedAt || null,
          expiresAt: state.expiresAt || null,
          createdAt: state.createdAt || Date.now(),
        };
      })
    );
  } catch (err) {
    console.error("[AdminVaultPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <AdminVaultView initialCredentials={initialCredentials} clients={clients} />
    </main>
  );
}
