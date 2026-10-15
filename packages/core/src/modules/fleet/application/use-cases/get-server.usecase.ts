import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import type { ServerDTO } from "../dtos/server.dto";
import type { Server } from "../../domain/entities/server.entity";

export class GetServerUseCase {
  constructor(private readonly serverRepo: ServerRepository) {}

  async execute(id: string): Promise<ServerDTO | null> {
    const server = await this.serverRepo.findById(id);
    if (!server) return null;
    return this.mapToDTO(server);
  }

  private mapToDTO(server: Server): ServerDTO {
    return {
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      username: server.username,
      hostFingerprint: server.hostFingerprint,
      status: server.status,
      lastCheckedAt: server.lastCheckedAt ? server.lastCheckedAt.toISOString() : null,
      errorMessage: server.errorMessage,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
    };
  }
}
