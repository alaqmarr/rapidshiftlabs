import { newId } from "../../../../shared/kernel/id";
import { ValidationError } from "../../../../shared/kernel/errors";
import { Server } from "../../domain/entities/server.entity";
import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import type { EncryptionService } from "../../domain/ports/encryption-service.port";
import type { RegisterServerInput, ServerDTO } from "../dtos/server.dto";

export class RegisterServerUseCase {
  constructor(
    private readonly serverRepo: ServerRepository,
    private readonly encryptionService: EncryptionService
  ) {}

  async execute(input: RegisterServerInput): Promise<ServerDTO> {
    if (!input.name || !input.name.trim()) {
      throw new ValidationError("Server name is required");
    }
    if (!input.host || !input.host.trim()) {
      throw new ValidationError("Server host is required");
    }
    if (!input.privateKey || !input.privateKey.trim()) {
      throw new ValidationError("Server private key is required");
    }

    const encryptedPrivateKey = this.encryptionService.encrypt(input.privateKey.trim());
    const keyPassphraseEnc = input.keyPassphrase?.trim()
      ? this.encryptionService.encrypt(input.keyPassphrase.trim())
      : null;

    const id = newId("srv");
    const server = Server.create({
      id,
      name: input.name,
      host: input.host,
      port: input.port ?? 22,
      username: input.username ?? "ubuntu",
      encryptedPrivateKey,
      keyPassphraseEnc,
      hostFingerprint: input.hostFingerprint ?? null,
    });

    await this.serverRepo.save(server);

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
