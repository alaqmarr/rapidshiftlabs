import { getContainer } from "@rsl/core/container";
import { ContractManager, type ContractItem, type ClientOption } from "@/features/contracts/contract-manager";

export const dynamic = "force-dynamic";

export default async function AdminContractsPage() {
  const container = getContainer();

  let initialContracts: ContractItem[] = [];
  let clients: ClientOption[] = [];

  try {
    const [contractsResult, clientsResult] = await Promise.all([
      container.contractsModule.listContractsUseCase.execute({ limit: 100 }),
      container.clientsModule.listClientsUseCase.execute({ limit: 100 }),
    ]);

    clients = clientsResult.items.map((c) => ({ id: c.id, name: c.name }));

    initialContracts = await Promise.all(
      contractsResult.items.map(async (c) => {
        const client = await container.clientDirectoryRepo.findById(c.clientId);
        return {
          id: c.id,
          code: c.code,
          title: c.title,
          clientId: c.clientId,
          clientName: client?.name || c.clientId,
          status: c.status,
          amountMinor: c.amountMinor,
          currency: c.currency,
          billingCycle: c.billingCycle,
          intervalCount: c.intervalCount,
          anchorDay: c.anchorDay,
          validFrom: c.validFrom,
          validTo: c.validTo,
          taxProfile: c.taxProfile,
          createdAt: c.createdAt,
        };
      }),
    );
  } catch (err) {
    console.error("[AdminContractsPage] Server fetch error:", err);
  }

  return <ContractManager initialContracts={initialContracts} clients={clients} />;
}
