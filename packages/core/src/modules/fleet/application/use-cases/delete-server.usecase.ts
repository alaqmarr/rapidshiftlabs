import type { ServerRepository } from "../../domain/repositories/server-repository.port";

export class DeleteServerUseCase {
  constructor(private readonly serverRepo: ServerRepository) {}

  async execute(id: string): Promise<void> {
    await this.serverRepo.delete(id);
  }
}
