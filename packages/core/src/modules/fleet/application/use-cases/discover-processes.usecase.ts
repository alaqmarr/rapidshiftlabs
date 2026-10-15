import { NotFoundError } from "../../../../shared/kernel/errors";
import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import type { Pm2ProcessRepository } from "../../domain/repositories/pm2-process-repository.port";
import type { SshClientPort } from "../../domain/ports/ssh-client.port";
import type { EncryptionService } from "../../domain/ports/encryption-service.port";
import { FleetCommandSanitizer } from "../services/fleet-command-sanitizer";
import { Pm2Parser } from "../services/pm2-parser";
import type { Pm2ProcessDTO } from "../dtos/pm2-process.dto";
import type { Pm2Process } from "../../domain/entities/pm2-process.entity";

export class DiscoverProcessesUseCase {
  constructor(
    private readonly serverRepo: ServerRepository,
    private readonly pm2ProcessRepo: Pm2ProcessRepository,
    private readonly sshClient: SshClientPort,
    private readonly encryptionService: EncryptionService
  ) {}

  async execute(serverId: string): Promise<Pm2ProcessDTO[]> {
    const server = await this.serverRepo.findById(serverId);
    if (!server) {
      throw new NotFoundError("Server", serverId);
    }

    const decryptedPrivateKey = this.encryptionService.decrypt(server.encryptedPrivateKey);
    const decryptedPassphrase = server.keyPassphraseEnc
      ? this.encryptionService.decrypt(server.keyPassphraseEnc)
      : null;

    const command = FleetCommandSanitizer.buildJlistCommand();

    try {
      const result = await this.sshClient.execute(
        {
          serverId: server.id,
          host: server.host,
          port: server.port,
          username: server.username,
          decryptedPrivateKey,
          decryptedPassphrase,
          hostFingerprint: server.hostFingerprint,
        },
        command
      );

      const parsedList = Pm2Parser.parseJlist(result.stdout);

      const synced = await this.pm2ProcessRepo.syncDiscoveredProcesses(
        server.id,
        parsedList.map((p) => ({
          pm2Id: p.pmId,
          name: p.name,
          status: p.status,
          cpu: p.cpu,
          memory: p.memory,
          restarts: p.restarts,
          uptimeMs: p.uptimeMs,
        }))
      );

      server.updateStatus("online");
      await this.serverRepo.save(server);

      return synced.map((p) => this.mapToDTO(p));
    } catch (err: any) {
      server.updateStatus("unreachable", err.message || "Failed to discover PM2 processes");
      await this.serverRepo.save(server);
      throw err;
    }
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
