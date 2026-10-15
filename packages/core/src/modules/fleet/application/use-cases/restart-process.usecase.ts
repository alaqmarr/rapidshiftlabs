import { newId } from "../../../../shared/kernel/id";
import {
  NotFoundError,
  ForbiddenError,
  RateLimitError,
} from "../../../../shared/kernel/errors";
import type { Actor } from "../../../../shared/kernel/actor";
import type { Pm2ProcessRepository } from "../../domain/repositories/pm2-process-repository.port";
import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import type { ProcessActionRepository } from "../../domain/repositories/process-action-repository.port";
import type { SshClientPort } from "../../domain/ports/ssh-client.port";
import type { EncryptionService } from "../../domain/ports/encryption-service.port";
import { FleetCommandSanitizer } from "../services/fleet-command-sanitizer";
import { ProcessAction } from "../../domain/entities/process-action.entity";
import type { RestartProcessResultDTO, RestartProcessOptions } from "../dtos/process-action.dto";

export type RestartActorInput =
  | Actor
  | {
      realm?: "admin" | "client";
      clientId?: string;
      userId?: string;
      kind?: string;
      id?: string;
    };

export interface RestartProcessInput {
  processId: string;
  actor: RestartActorInput;
  options?: RestartProcessOptions;
}

export class RestartProcessUseCase {
  constructor(
    private readonly pm2ProcessRepo: Pm2ProcessRepository,
    private readonly serverRepo: ServerRepository,
    private readonly processActionRepo: ProcessActionRepository,
    private readonly sshClient: SshClientPort,
    private readonly encryptionService: EncryptionService
  ) {}

  async execute(input: RestartProcessInput): Promise<RestartProcessResultDTO> {
    const process = await this.pm2ProcessRepo.findById(input.processId);
    if (!process) {
      throw new NotFoundError("Pm2Process", input.processId);
    }

    // 1. Authorization check
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

      if (!process.allowClientRestart) {
        throw new ForbiddenError("Restart action is disabled for this process");
      }
    }

    // 2. Cooldown check against last successful restart
    const lastAction = await this.processActionRepo.findLastSuccessfulRestart(process.id);
    if (lastAction) {
      const elapsedSec = (Date.now() - lastAction.createdAt.getTime()) / 1000;
      const cooldownSec = process.restartCooldownSec || 60;
      if (elapsedSec < cooldownSec) {
        const remaining = Math.ceil(cooldownSec - elapsedSec);
        throw new RateLimitError(
          remaining,
          `Process restart cooldown active. Please wait ${remaining}s before restarting.`
        );
      }
    }

    // 3. Retrieve Server and decrypt credentials
    const server = await this.serverRepo.findById(process.serverId);
    if (!server) {
      throw new NotFoundError("Server", process.serverId);
    }

    const decryptedPrivateKey = this.encryptionService.decrypt(server.encryptedPrivateKey);
    const decryptedPassphrase = server.keyPassphraseEnc
      ? this.encryptionService.decrypt(server.keyPassphraseEnc)
      : null;

    // 4. Build sanitized command
    const command = FleetCommandSanitizer.buildRestartCommand(process.pm2Id);

    // 5. Track process action
    const actionId = newId("act");
    const triggeredBy =
      "userId" in input.actor && input.actor.userId
        ? input.actor.userId
        : "id" in input.actor && input.actor.id
        ? input.actor.id
        : "system";

    const action = ProcessAction.create({
      id: actionId,
      processId: process.id,
      clientId: process.clientId,
      action: "restart",
      triggeredBy,
      status: "pending",
    });

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
        command,
        { timeoutMs: input.options?.timeoutMs }
      );

      action.complete(result.stdout.slice(0, 500));
      await this.processActionRepo.save(action);

      return {
        success: true,
        message: `Process ${process.name} (#${process.pm2Id}) restarted successfully.`,
        actionId,
      };
    } catch (err: any) {
      action.fail(err.message, err.stdout ? String(err.stdout).slice(0, 500) : null);
      await this.processActionRepo.save(action);
      throw err;
    }
  }
}
