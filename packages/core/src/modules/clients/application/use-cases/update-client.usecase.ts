import type { ClientRepository } from "../../domain/repositories/client-repository.port";
import type { Client, ClientProps } from "../../domain/entities/client.entity";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class UpdateClientUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(id: string, params: Partial<Omit<ClientProps, "id" | "createdAt" | "updatedAt">>): Promise<Client> {
    const client = await this.repo.findById(id);
    if (!client) {
      throw new NotFoundError("Client", id);
    }

    client.update(params);
    await this.repo.update(client);
    return client;
  }
}
