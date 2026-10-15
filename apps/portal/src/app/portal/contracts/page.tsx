import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import {
  PortalContractsView,
  type ClientData,
  type ContractItem,
} from "@/features/contracts/portal-contracts-view";

export const dynamic = "force-dynamic";

export default async function ClientPortalContractsPage() {
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

  let clientData: ClientData | null = null;
  let contracts: ContractItem[] = [];

  try {
    const [client, contractsRes] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId),
      container.contractRepo.list({ clientId, limit: 100 }),
    ]);

    if (client) {
      clientData = {
        id: client.id,
        name: client.name,
      };
    }

    contracts = contractsRes.items.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      clientId: c.clientId,
      status: c.status,
      amountMinor: c.amountMinor,
      currency: c.currency,
      billingCycle: c.billingCycle,
      intervalCount: c.intervalCount,
      anchorDay: c.anchorDay,
      validFrom: c.validFrom,
      validTo: c.validTo,
      autoRenew: c.autoRenew,
      taxProfile: c.taxProfile,
      notes: c.notes || undefined,
      createdAt: c.createdAt,
      items: c.items?.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        amountMinor: item.amountMinor,
      })),
    }));
  } catch (err) {
    console.error("[ClientPortalContractsPage] Server fetch error:", err);
  }

  return <PortalContractsView client={clientData} contracts={contracts} />;
}
