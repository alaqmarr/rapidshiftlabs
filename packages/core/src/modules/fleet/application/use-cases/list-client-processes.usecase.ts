import type { Pm2ProcessRepository } from "../../domain/repositories/pm2-process-repository.port";
import type { Pm2ProcessDTO } from "../dtos/pm2-process.dto";
import type { Pm2Process } from "../../domain/entities/pm2-process.entity";
import type { RestartActorInput } from "./restart-process.usecase";

export interface ListClientProcessesInput {
  actor: RestartActorInput;
  serverId?: string;
}

export class ListClientProcessesUseCase {
  constructor(private readonly pm2ProcessRepo: Pm2ProcessRepository) {}

  async execute(input: ListClientProcessesInput): Promise<Pm2ProcessDTO[]> {
    const isClient =
      ("realm" in input.actor && input.actor.realm === "client") ||
      ("kind" in input.actor &&
        (input.actor.kind === "client_user" ||
          input.actor.kind === "api_key" ||
          input.actor.kind === "embed"));

    let processes: Pm2Process[];

    if (isClient) {
      const clientId =
        "clientId" in input.actor && input.actor.clientId ? input.actor.clientId : null;

      if (!clientId) {
        return [];
      }

      processes = await this.pm2ProcessRepo.listByClientId(clientId);
      if (input.serverId) {
        processes = processes.filter((p) => p.serverId === input.serverId);
      }
    } else {
      if (input.serverId) {
        processes = await this.pm2ProcessRepo.listByServerId(input.serverId);
      } else {
        processes = await this.pm2ProcessRepo.listAll();
      }
    }

    return processes.map((p) => this.mapToDTO(p));
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
