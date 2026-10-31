import { NotFoundError } from "../../../../shared/kernel/errors";
import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import type { EncryptionService } from "../../domain/ports/encryption-service.port";
import type { ServerConnectionConfig } from "../../domain/ports/ssh-client.port";
import type {
  ServerAdminOpsPort,
  RemoteDirectoryListing,
  RemoteFileContent,
  NginxServerStatus,
  CreateNginxSiteInput,
  NginxMutationResult,
  ProvisionSslInput,
  ProvisionSslResult,
  ServerOutdatedPackagesReport,
  UpgradePackagesInput,
  UpgradePackagesResult,
} from "../../domain/ports/server-admin-ops.port";

export class ServerAdminOpsUseCase {
  constructor(
    private readonly serverRepo: ServerRepository,
    private readonly encryptionService: EncryptionService,
    private readonly adminOps: ServerAdminOpsPort
  ) {}

  public async resolveConnectionConfig(serverId: string): Promise<ServerConnectionConfig> {
    const server = await this.serverRepo.findById(serverId);
    if (!server) {
      throw new NotFoundError("Server", serverId);
    }

    const decryptedPrivateKey = this.encryptionService.decrypt(server.encryptedPrivateKey);
    const decryptedPassphrase = server.keyPassphraseEnc
      ? this.encryptionService.decrypt(server.keyPassphraseEnc)
      : null;

    return {
      serverId: server.id,
      host: server.host,
      port: server.port,
      username: server.username,
      decryptedPrivateKey,
      decryptedPassphrase,
      hostFingerprint: server.hostFingerprint,
    };
  }

  // File Manager
  public async listDirectory(
    serverId: string,
    targetPath?: string
  ): Promise<RemoteDirectoryListing> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.listDirectory(cfg, targetPath);
  }

  public async readFile(serverId: string, filePath: string): Promise<RemoteFileContent> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.readFile(cfg, filePath);
  }

  public async writeFile(
    serverId: string,
    filePath: string,
    content: string,
    options?: { modeOctal?: string; createParents?: boolean }
  ): Promise<RemoteFileContent> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.writeFile(cfg, filePath, content, options);
  }

  public async createDirectory(
    serverId: string,
    dirPath: string
  ): Promise<{ path: string; created: boolean }> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.createDirectory(cfg, dirPath);
  }

  public async deleteEntry(
    serverId: string,
    targetPath: string,
    recursive?: boolean
  ): Promise<{ path: string; deleted: boolean }> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.deleteEntry(cfg, targetPath, recursive);
  }

  public async renameEntry(
    serverId: string,
    oldPath: string,
    newPath: string
  ): Promise<{ oldPath: string; newPath: string }> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.renameEntry(cfg, oldPath, newPath);
  }

  public async chmodEntry(
    serverId: string,
    targetPath: string,
    modeOctal: string
  ): Promise<{ path: string; permissionsOctal: string }> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.chmodEntry(cfg, targetPath, modeOctal);
  }

  // Nginx & Direct SSL
  public async getNginxStatus(serverId: string): Promise<NginxServerStatus> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.getNginxStatus(cfg);
  }

  public async saveNginxSite(
    serverId: string,
    input: CreateNginxSiteInput
  ): Promise<NginxMutationResult> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.saveNginxSite(cfg, input);
  }

  public async toggleNginxSite(
    serverId: string,
    filename: string,
    enable: boolean
  ): Promise<{ success: boolean; enabled: boolean; output: string }> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.toggleNginxSite(cfg, filename, enable);
  }

  public async deleteNginxSite(
    serverId: string,
    filename: string
  ): Promise<{ success: boolean; deleted: boolean; output: string }> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.deleteNginxSite(cfg, filename);
  }

  public async testAndReloadNginx(
    serverId: string
  ): Promise<{ success: boolean; output: string }> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.testAndReloadNginx(cfg);
  }

  public async provisionSslCertificate(
    serverId: string,
    input: ProvisionSslInput
  ): Promise<ProvisionSslResult> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.provisionSslCertificate(cfg, input);
  }

  public async getNginxLogs(
    serverId: string,
    logType: "error" | "access",
    lines?: number
  ): Promise<string> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.getNginxLogs(cfg, logType, lines);
  }

  // Outdated Packages
  public async scanOutdatedPackages(
    serverId: string,
    options?: { refreshMetadata?: boolean }
  ): Promise<ServerOutdatedPackagesReport> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.scanOutdatedPackages(cfg, options);
  }

  public async upgradePackages(
    serverId: string,
    input: UpgradePackagesInput
  ): Promise<UpgradePackagesResult> {
    const cfg = await this.resolveConnectionConfig(serverId);
    return this.adminOps.upgradePackages(cfg, input);
  }
}
