import type { ClientRepository, ListClientsQuery } from "../../domain/repositories/client-repository.port";
import type { Client } from "../../domain/entities/client.entity";

export class ListClientsUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(query?: ListClientsQuery): Promise<{ items: Client[]; total: number }> {
    return this.repo.list(query);
  }
}
