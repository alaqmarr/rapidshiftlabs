import { NotFoundError, ForbiddenError } from "../../../../shared/kernel/errors";
import type { Pm2ProcessRepository } from "../../domain/repositories/pm2-process-repository.port";
import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import type { SshClientPort } from "../../domain/ports/ssh-client.port";
import type { EncryptionService } from "../../domain/ports/encryption-service.port";
import { FleetCommandSanitizer } from "../services/fleet-command-sanitizer";
import type { RestartActorInput } from "./restart-process.usecase";
import type { GetProcessLogsOptions } from "../dtos/process-action.dto";

export interface GetProcessLogsInput {
  processId: string;
  actor: RestartActorInput;
  options?: GetProcessLogsOptions;
}

export class GetProcessLogsUseCase {
  constructor(
    private readonly pm2ProcessRepo: Pm2ProcessRepository,
    private readonly serverRepo: ServerRepository,
    private readonly sshClient: SshClientPort,
    private readonly encryptionService: EncryptionService
  ) {}

  async execute(input: GetProcessLogsInput): Promise<string> {
    const process = await this.pm2ProcessRepo.findById(input.processId);
    if (!process) {
      throw new NotFoundError("Pm2Process", input.processId);
    }

    // Client Authorization Check
    const isClient =
      ("realm" in input.actor && input.actor.realm === "client") ||
      ("kind" in input.actor &&
        (input.actor.kind === "client_user" ||
          input.actor.kind === "api_key" ||
          input.actor.kind === "embed"));

    if (isClient) {
      const actorClientId =
        "clientId" in input.actor && input.actor.clientId ? input.actor.clientId : null;

      if (!actorClientId || process.clientId !== actorClientId) {
        throw new ForbiddenError("You do not have permission to manage this process");
      }
    }

    const lines = input.options?.lines ?? 100;
    const command = FleetCommandSanitizer.buildLogsCommand(process.pm2Id, lines);

    const server = await this.serverRepo.findById(process.serverId);
    if (!server) {
      throw new NotFoundError("Server", process.serverId);
    }

    const decryptedPrivateKey = this.encryptionService.decrypt(server.encryptedPrivateKey);
    const decryptedPassphrase = server.keyPassphraseEnc
      ? this.encryptionService.decrypt(server.keyPassphraseEnc)
      : null;

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
      command,
      { timeoutMs: input.options?.timeoutMs }
    );

    return result.stdout;
  }
}
