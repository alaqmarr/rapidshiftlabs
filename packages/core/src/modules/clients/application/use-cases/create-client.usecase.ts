import { Client, type CreateClientParams } from "../../domain/entities/client.entity";
import type { ClientRepository } from "../../domain/repositories/client-repository.port";
import { ConflictError } from "../../../../shared/kernel/errors";

export class CreateClientUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(params: CreateClientParams): Promise<Client> {
    const client = Client.create(params);
    const existing = await this.repo.findBySlug(client.slug);
    if (existing) {
      throw new ConflictError(`Client with slug '${client.slug}' already exists`);
    }

    await this.repo.create(client);
    return client;
  }
}
