import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import { PortalVaultView } from "@/features/vault/portal-vault-view";
import type { SerializedVaultCredential } from "@/features/vault/admin-vault-view";

export const dynamic = "force-dynamic";

export default async function PortalVaultPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) {
    redirect("/portal/login");
  }

  const container = getContainer();

  let clientName = "Client Organization";
  let credentials: SerializedVaultCredential[] = [];

  try {
    const actor = SYSTEM_ACTOR("portal-vault-page");
    const [client, credsRes] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId).catch(() => null),
      container.vault.listCredentialsUseCase.execute({ clientId }, actor).catch(() => []),
    ]);

    if (client) {
      clientName = client.name;
    }

    credentials = credsRes.map((rawC: any) => {
      const state = typeof rawC.toState === "function" ? rawC.toState() : rawC.props || rawC;
      return {
        id: state.id,
        clientId: state.clientId,
        name: state.name,
        category: state.category,
        username: state.username || null,
        oneTimeReveal: !!state.oneTimeReveal,
        revealedCount: state.revealedCount || 0,
        lastRevealedAt: state.lastRevealedAt || null,
        expiresAt: state.expiresAt || null,
        createdAt: state.createdAt || Date.now(),
      };
    });
  } catch (err) {
    console.error("[PortalVaultPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <PortalVaultView
        clientId={clientId}
        clientName={clientName}
        initialCredentials={credentials}
      />
    </main>
  );
}
