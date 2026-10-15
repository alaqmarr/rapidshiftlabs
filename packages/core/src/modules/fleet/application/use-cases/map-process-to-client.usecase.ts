import { NotFoundError } from "../../../../shared/kernel/errors";
import type { Pm2ProcessRepository } from "../../domain/repositories/pm2-process-repository.port";
import type { MapProcessToClientInput, Pm2ProcessDTO } from "../dtos/pm2-process.dto";
import type { Pm2Process } from "../../domain/entities/pm2-process.entity";

export class MapProcessToClientUseCase {
  constructor(private readonly pm2ProcessRepo: Pm2ProcessRepository) {}

  async execute(input: MapProcessToClientInput): Promise<Pm2ProcessDTO> {
    const process = await this.pm2ProcessRepo.findById(input.processId);
    if (!process) {
      throw new NotFoundError("Pm2Process", input.processId);
    }

    process.mapToClient(
      input.clientId ?? null,
      input.allowClientRestart ?? false,
      input.restartCooldownSec ?? 60
    );

    await this.pm2ProcessRepo.save(process);

    return this.mapToDTO(process);
  }

  private mapToDTO(process: Pm2Process): Pm2ProcessDTO {
    return {
      id: process.id,
      serverId: process.serverId,
      pm2Id: process.pm2Id,
      name: process.name,
      clientId: process.clientId,
      allowClientRestart: process.allowClientRestart,
      restartCooldownSec: process.restartCooldownSec,
      status: process.status,
      cpu: process.cpu,
      memory: process.memory,
      restarts: process.restarts,
      uptimeMs: process.uptimeMs,
      lastDiscoveredAt: process.lastDiscoveredAt.toISOString(),
      createdAt: process.createdAt.toISOString(),
      updatedAt: process.updatedAt.toISOString(),
    };
  }
}
