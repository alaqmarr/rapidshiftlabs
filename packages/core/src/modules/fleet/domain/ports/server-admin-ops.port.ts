import type { ServerConnectionConfig } from "./ssh-client.port";

export interface RemoteFileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  permissionsOctal: string;
  permissionsSymbolic: string;
  modifiedAt: number;
  isDotfile: boolean;
  isEnvFile: boolean;
}

export interface RemoteBookmark {
  label: string;
  path: string;
  category: "system" | "pm2" | "web";
}

export interface RemoteDirectoryListing {
  currentPath: string;
  parentPath: string | null;
  homeDir: string;
  entries: RemoteFileEntry[];
  bookmarks: RemoteBookmark[];
  simulatedFallback?: boolean;
}

export interface RemoteFileContent {
  path: string;
  name: string;
  content: string;
  size: number;
  permissionsOctal: string;
  modifiedAt: number;
  exists: boolean;
  simulatedFallback?: boolean;
}

export interface NginxSiteConfig {
  filename: string;
  domains: string[];
  primaryDomain: string;
  enabled: boolean;
  mode: "proxy" | "static" | "redirect" | "custom";
  proxyTarget: string | null;
  proxyPort: number | null;
  rootPath: string | null;
  redirectTarget: string | null;
  sslEnabled: boolean;
  sslCertPath: string | null;
  sslExpiresAt: string | null;
  websocketsEnabled: boolean;
  clientMaxBodySize: string | null;
  rawConfig: string;
}

export interface ListeningPortEntry {
  port: number;
  address: string;
  process: string;
}

export interface NginxServerStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  certbotInstalled: boolean;
  configTestOk: boolean;
  configTestOutput: string;
  listeningPorts: ListeningPortEntry[];
  sites: NginxSiteConfig[];
  simulatedFallback?: boolean;
}

export interface CreateNginxSiteInput {
  filename?: string;
  domains: string[];
  mode: "proxy" | "static" | "redirect";
  proxyHost?: string;
  proxyPort?: number;
  rootPath?: string;
  spaFallback?: boolean;
  redirectTarget?: string;
  redirectPermanent?: boolean;
  enableWebsockets?: boolean;
  clientMaxBodySize?: string;
  enableGzip?: boolean;
  enableSecurityHeaders?: boolean;
  enableSite?: boolean;
  rawOverride?: string;
}

export interface NginxMutationResult {
  success: boolean;
  filename: string;
  configTestOutput: string;
  reloaded: boolean;
  generatedConfig: string;
}

export interface ProvisionSslInput {
  domains: string[];
  email: string;
  redirectHttpToHttps?: boolean;
  installCertbotIfMissing?: boolean;
}

export interface ProvisionSslResult {
  success: boolean;
  domains: string[];
  output: string;
  certPath: string | null;
}

export interface OutdatedPackageItem {
  name: string;
  ecosystem: "apt" | "dnf" | "apk" | "npm-global" | "project-npm";
  currentVersion: string;
  latestVersion: string;
  wantedVersion?: string;
  architecture?: string;
  repository?: string;
  isSecurity: boolean;
  severity: "critical" | "major" | "minor" | "patch";
  projectPath?: string;
}

export interface ServerOutdatedPackagesReport {
  serverId: string;
  collectedAt: number;
  packageManager: "apt" | "dnf" | "apk" | "unknown";
  rebootRequired: boolean;
  totalCount: number;
  securityCount: number;
  osCount: number;
  globalNodeCount: number;
  projectCount: number;
  packages: OutdatedPackageItem[];
  simulatedFallback?: boolean;
}

export interface UpgradePackagesInput {
  ecosystem: "apt" | "dnf" | "npm-global";
  packages?: string[];
  securityOnly?: boolean;
}

export interface UpgradePackagesResult {
  success: boolean;
  commandSummary: string;
  output: string;
  upgradedCount: number;
}

export interface ServerAdminOpsPort {
  // File Manager (SFTP)
  listDirectory(
    server: ServerConnectionConfig,
    targetPath?: string
  ): Promise<RemoteDirectoryListing>;
  readFile(
    server: ServerConnectionConfig,
    filePath: string
  ): Promise<RemoteFileContent>;
  writeFile(
    server: ServerConnectionConfig,
    filePath: string,
    content: string,
    options?: { modeOctal?: string; createParents?: boolean }
  ): Promise<RemoteFileContent>;
  createDirectory(
    server: ServerConnectionConfig,
    dirPath: string
  ): Promise<{ path: string; created: boolean }>;
  deleteEntry(
    server: ServerConnectionConfig,
    targetPath: string,
    recursive?: boolean
  ): Promise<{ path: string; deleted: boolean }>;
  renameEntry(
    server: ServerConnectionConfig,
    oldPath: string,
    newPath: string
  ): Promise<{ oldPath: string; newPath: string }>;
  chmodEntry(
    server: ServerConnectionConfig,
    targetPath: string,
    modeOctal: string
  ): Promise<{ path: string; permissionsOctal: string }>;

  // Nginx & Direct SSL Provisioning
  getNginxStatus(server: ServerConnectionConfig): Promise<NginxServerStatus>;
  saveNginxSite(
    server: ServerConnectionConfig,
    input: CreateNginxSiteInput
  ): Promise<NginxMutationResult>;
  toggleNginxSite(
    server: ServerConnectionConfig,
    filename: string,
    enable: boolean
  ): Promise<{ success: boolean; enabled: boolean; output: string }>;
  deleteNginxSite(
    server: ServerConnectionConfig,
    filename: string
  ): Promise<{ success: boolean; deleted: boolean; output: string }>;
  testAndReloadNginx(
    server: ServerConnectionConfig
  ): Promise<{ success: boolean; output: string }>;
  provisionSslCertificate(
    server: ServerConnectionConfig,
    input: ProvisionSslInput
  ): Promise<ProvisionSslResult>;
  getNginxLogs(
    server: ServerConnectionConfig,
    logType: "error" | "access",
    lines?: number
  ): Promise<string>;

  // Outdated Packages Scanner & Upgrader
  scanOutdatedPackages(
    server: ServerConnectionConfig,
    options?: { refreshMetadata?: boolean }
  ): Promise<ServerOutdatedPackagesReport>;
  upgradePackages(
    server: ServerConnectionConfig,
    input: UpgradePackagesInput
  ): Promise<UpgradePackagesResult>;
}
