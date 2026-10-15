import { DrizzleServerRepository } from "./infrastructure/repositories/drizzle-server.repository";
import { DrizzlePm2ProcessRepository } from "./infrastructure/repositories/drizzle-pm2-process.repository";
import { DrizzleProcessActionRepository } from "./infrastructure/repositories/drizzle-process-action.repository";
import { AesEncryptionService } from "./infrastructure/crypto/aes-encryption.service";
import { NodeSsh2Adapter } from "./infrastructure/adapters/node-ssh2.adapter";
import type { ServerRepository } from "./domain/repositories/server-repository.port";
import type { Pm2ProcessRepository } from "./domain/repositories/pm2-process-repository.port";
import type { ProcessActionRepository } from "./domain/repositories/process-action-repository.port";
import type { EncryptionService } from "./domain/ports/encryption-service.port";
import type { SshClientPort } from "./domain/ports/ssh-client.port";
import { RegisterServerUseCase } from "./application/use-cases/register-server.usecase";
import { GetServerUseCase } from "./application/use-cases/get-server.usecase";
import { ListServersUseCase } from "./application/use-cases/list-servers.usecase";
import { DeleteServerUseCase } from "./application/use-cases/delete-server.usecase";
import { DiscoverProcessesUseCase } from "./application/use-cases/discover-processes.usecase";
import { MapProcessToClientUseCase } from "./application/use-cases/map-process-to-client.usecase";
import {
  RestartProcessUseCase,
  type RestartProcessInput,
} from "./application/use-cases/restart-process.usecase";
import {
  GetProcessLogsUseCase,
  type GetProcessLogsInput,
} from "./application/use-cases/get-process-logs.usecase";
import {
  ListClientProcessesUseCase,
  type ListClientProcessesInput,
} from "./application/use-cases/list-client-processes.usecase";
import { GetServerStatsUseCase } from "./application/use-cases/get-server-stats.usecase";
import { DiagnoseAndHealProcessUseCase } from "./application/use-cases/diagnose-and-heal-process.usecase";
import { getSupportModule, type CreateTicketUseCase } from "../support";
import { getWebhookDispatcher, type OutboundWebhookDispatcher } from "../../shared/infrastructure/webhooks";
import type { RegisterServerInput, ServerDTO, ServerStatsDTO } from "./application/dtos/server.dto";
import type { MapProcessToClientInput, Pm2ProcessDTO } from "./application/dtos/pm2-process.dto";
import type { RestartProcessResultDTO } from "./application/dtos/process-action.dto";

// Domain exports
export * from "./domain/entities/server.entity";
export * from "./domain/entities/pm2-process.entity";
export * from "./domain/entities/process-action.entity";
export * from "./domain/ports/encryption-service.port";
export * from "./domain/ports/ssh-client.port";
export * from "./domain/repositories/server-repository.port";
export * from "./domain/repositories/pm2-process-repository.port";
export * from "./domain/repositories/process-action-repository.port";

// Application exports
export * from "./application/dtos/server.dto";
export * from "./application/dtos/pm2-process.dto";
export * from "./application/dtos/process-action.dto";
export * from "./application/services/fleet-command-sanitizer";
export * from "./application/services/pm2-parser";
export * from "./application/services/server-stats-parser";
export * from "./application/use-cases/register-server.usecase";
export * from "./application/use-cases/get-server.usecase";
export * from "./application/use-cases/list-servers.usecase";
export * from "./application/use-cases/delete-server.usecase";
export * from "./application/use-cases/discover-processes.usecase";
export * from "./application/use-cases/map-process-to-client.usecase";
export * from "./application/use-cases/restart-process.usecase";
export * from "./application/use-cases/get-process-logs.usecase";
export * from "./application/use-cases/list-client-processes.usecase";
export * from "./application/use-cases/get-server-stats.usecase";
export * from "./application/services/fleet-diagnostics.service";
export * from "./application/use-cases/diagnose-and-heal-process.usecase";

// Infrastructure exports
export * from "./infrastructure/crypto/aes-encryption.service";
export * from "./infrastructure/adapters/node-ssh2.adapter";
export * from "./infrastructure/repositories/drizzle-server.repository";
export * from "./infrastructure/repositories/drizzle-pm2-process.repository";
export * from "./infrastructure/repositories/drizzle-process-action.repository";

export interface FleetModuleDependencies {
  serverRepo?: ServerRepository;
  pm2ProcessRepo?: Pm2ProcessRepository;
  processActionRepo?: ProcessActionRepository;
  encryptionService?: EncryptionService;
  sshClient?: SshClientPort;
  createTicketUseCase?: CreateTicketUseCase;
  webhookDispatcher?: OutboundWebhookDispatcher;
}

export class FleetModule {
  public readonly serverRepo: ServerRepository;
  public readonly pm2ProcessRepo: Pm2ProcessRepository;
  public readonly processActionRepo: ProcessActionRepository;
  public readonly encryptionService: EncryptionService;
  public readonly sshClient: SshClientPort;

  public readonly registerServerUseCase: RegisterServerUseCase;
  public readonly getServerUseCase: GetServerUseCase;
  public readonly listServersUseCase: ListServersUseCase;
  public readonly deleteServerUseCase: DeleteServerUseCase;
  public readonly discoverProcessesUseCase: DiscoverProcessesUseCase;
  public readonly mapProcessToClientUseCase: MapProcessToClientUseCase;
  public readonly restartProcessUseCase: RestartProcessUseCase;
  public readonly getProcessLogsUseCase: GetProcessLogsUseCase;
  public readonly listClientProcessesUseCase: ListClientProcessesUseCase;
  public readonly getServerStatsUseCase: GetServerStatsUseCase;
  public readonly diagnoseAndHealUseCase: DiagnoseAndHealProcessUseCase;

  constructor(deps?: FleetModuleDependencies) {
    this.serverRepo = deps?.serverRepo ?? new DrizzleServerRepository();
    this.pm2ProcessRepo = deps?.pm2ProcessRepo ?? new DrizzlePm2ProcessRepository();
    this.processActionRepo = deps?.processActionRepo ?? new DrizzleProcessActionRepository();
    this.encryptionService = deps?.encryptionService ?? new AesEncryptionService();
    this.sshClient = deps?.sshClient ?? new NodeSsh2Adapter();

    this.registerServerUseCase = new RegisterServerUseCase(
      this.serverRepo,
      this.encryptionService
    );
    this.getServerUseCase = new GetServerUseCase(this.serverRepo);
    this.listServersUseCase = new ListServersUseCase(this.serverRepo);
    this.deleteServerUseCase = new DeleteServerUseCase(this.serverRepo);
    this.discoverProcessesUseCase = new DiscoverProcessesUseCase(
      this.serverRepo,
      this.pm2ProcessRepo,
      this.sshClient,
      this.encryptionService
    );
    this.mapProcessToClientUseCase = new MapProcessToClientUseCase(this.pm2ProcessRepo);
    this.restartProcessUseCase = new RestartProcessUseCase(
      this.pm2ProcessRepo,
      this.serverRepo,
      this.processActionRepo,
      this.sshClient,
      this.encryptionService
    );
    this.getProcessLogsUseCase = new GetProcessLogsUseCase(
      this.pm2ProcessRepo,
      this.serverRepo,
      this.sshClient,
      this.encryptionService
    );
    this.listClientProcessesUseCase = new ListClientProcessesUseCase(this.pm2ProcessRepo);
    this.getServerStatsUseCase = new GetServerStatsUseCase(
      this.serverRepo,
      this.pm2ProcessRepo,
      this.sshClient,
      this.encryptionService
    );

    const createTicket =
      deps?.createTicketUseCase ??
      (() => {
        try {
          return getSupportModule().createTicketUseCase;
        } catch {
          return undefined;
        }
      })();

    const webhookDisp =
      deps?.webhookDispatcher ??
      (() => {
        try {
          return getWebhookDispatcher();
        } catch {
          return undefined;
        }
      })();

    this.diagnoseAndHealUseCase = new DiagnoseAndHealProcessUseCase(
      this.pm2ProcessRepo,
      this.serverRepo,
      this.processActionRepo,
      this.sshClient,
      this.encryptionService,
      createTicket,
      webhookDisp
    );
  }

  async diagnoseAndHealProcess(input: any) {
    return this.diagnoseAndHealUseCase.execute(input);
  }

  async registerServer(input: RegisterServerInput): Promise<ServerDTO> {
    return this.registerServerUseCase.execute(input);
  }

  async getServer(id: string): Promise<ServerDTO | null> {
    return this.getServerUseCase.execute(id);
  }

  async listServers(): Promise<ServerDTO[]> {
    return this.listServersUseCase.execute();
  }

  async deleteServer(id: string): Promise<void> {
    return this.deleteServerUseCase.execute(id);
  }

  async discoverProcesses(serverId: string): Promise<Pm2ProcessDTO[]> {
    return this.discoverProcessesUseCase.execute(serverId);
  }

  async mapProcessToClient(input: MapProcessToClientInput): Promise<Pm2ProcessDTO> {
    return this.mapProcessToClientUseCase.execute(input);
  }

  async restartProcess(input: RestartProcessInput): Promise<RestartProcessResultDTO> {
    return this.restartProcessUseCase.execute(input);
  }

  async getProcessLogs(input: GetProcessLogsInput): Promise<string> {
    return this.getProcessLogsUseCase.execute(input);
  }

  async listClientProcesses(input: ListClientProcessesInput): Promise<Pm2ProcessDTO[]> {
    return this.listClientProcessesUseCase.execute(input);
  }

  async getServerStats(serverId: string): Promise<ServerStatsDTO> {
    return this.getServerStatsUseCase.execute(serverId);
  }
}

let instance: FleetModule | null = null;

export function getFleetModule(deps?: FleetModuleDependencies): FleetModule {
  if (deps) {
    return new FleetModule(deps);
  }
  if (!instance) {
    instance = new FleetModule();
  }
  return instance;
}
